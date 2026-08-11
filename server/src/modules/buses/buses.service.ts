import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, ilike, inArray, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { buses, schedules, trips, tickets, ticketReviews, transactions, users } from '../../database/schema';
import { id, bookingRef } from '../../common/id';
import { creditWallet, debitWalletOrFail, refundsToWallet } from '../../common/wallet.util';
import { apiError } from '../../common/exceptions';
 import { computeCancellationPolicy, durationBetween, todayIso } from './bus-time.util';

import { generateTripsForSchedule } from './trip-generator';
 import type { BookBusDto, CancelTicketDto, CreateScheduleDto, CreateTicketReviewDto, RegisterBusDto } from './dto/buses.dto';

import { NotificationsService } from '../notifications/notifications.service';
import { PartnerDocumentsService } from '../partner-documents/partner-documents.service';


const SERVICE_FEE_RATE = 0.02;

@Injectable()
export class BusesService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database,
  private readonly notifications: NotificationsService,
  private readonly partnerDocuments: PartnerDocumentsService,
) {}

  /* ───────────────────────────── Customer-facing ─────────────────────── */

  async search(from?: string, to?: string, date?: string) {
    const today = todayIso();
    const conditions = [eq(trips.status, 'scheduled'), gte(trips.date, today)];
    if (from) conditions.push(ilike(trips.fromCity, `%${from}%`));
    if (to) conditions.push(ilike(trips.toCity, `%${to}%`));
    if (date) conditions.push(eq(trips.date, date));

    const rows = await this.db
      .select({
        id: trips.id,
        fromCity: trips.fromCity,
        toCity: trips.toCity,
        date: trips.date,
        departure: trips.departure,
        arrival: trips.arrival,
        duration: trips.duration,
        price: trips.price,
        totalSeats: trips.totalSeats,
        bookedSeats: trips.bookedSeats,
        type: trips.type,
        amenities: trips.amenities,
        operatorName: users.name,
        businessName: users.businessName,
      })
      .from(trips)
      .innerJoin(users, eq(users.id, trips.operatorId))
      .where(and(...conditions))
      .orderBy(asc(trips.date));

    return rows.map((t) => ({
      id: t.id,
      operator: t.businessName ?? t.operatorName ?? 'Operator',
      from: t.fromCity,
      to: t.toCity,
      date: t.date,
      departure: t.departure,
      arrival: t.arrival,
      duration: t.duration,
      price: Number(t.price),
      seatsLeft: t.totalSeats - t.bookedSeats.length,
      type: t.type,
      amenities: t.amenities,
      busPhoto: null,
    }));
  }

  async detail(tripId: string) {
    const [t] = await this.db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    if (!t) apiError(404, 'This departure is no longer available.');

    const [operator] = await this.db
      .select({ name: users.name, businessName: users.businessName })
      .from(users)
      .where(eq(users.id, t.operatorId))
      .limit(1);

    return {
      id: t.id,
      operator: operator?.businessName ?? operator?.name ?? 'Operator',
      from: t.fromCity,
      to: t.toCity,
      date: t.date,
      departure: t.departure,
      arrival: t.arrival,
      duration: t.duration,
      price: Number(t.price),
      seatsLeft: t.totalSeats - t.bookedSeats.length,
      type: t.type,
      amenities: t.amenities,
      busPhoto: null,
      totalSeats: t.totalSeats,
      totalRows: t.totalRows,
      bookedSeats: t.bookedSeats,
      status: t.status === 'scheduled' ? ('active' as const) : t.status,
    };
  }

  /**
   * Books seats on a trip with true atomicity: the UPDATE itself enforces
   * "none of these seats are already booked" via a SQL predicate, so two
   * concurrent requests for an overlapping seat can never both succeed —
   * one wins, the other gets a clean 409. This directly applies the same
   * race-condition fix already proven on the original ZamZam Nepal project
   * (atomic seat booking via crypto-safe booking references), but pushed
   * down to the database row lock instead of relying on app-level checks.
   */
  async book(customerId: string, tripId: string, dto: BookBusDto) {
    // Normalize ("1a" → "1A") and de-duplicate before anything else so the
    // seat/passenger pairing and inventory writes always use one canonical
    // form. Duplicates in the request would otherwise double-charge.
    const seats = [...new Set(dto.seats.map((s) => s.trim().toUpperCase()))];
    if (seats.length !== dto.passengers.length) {
      apiError(400, 'Each selected seat needs exactly one passenger.');
    }

    return this.db.transaction(async (tx) => {
      const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId)).limit(1);
      if (!trip) apiError(404, 'This departure is no longer available.');
      if (trip.status !== 'scheduled') apiError(409, 'This departure is no longer available.');

      // Seats must actually exist on this bus's layout (rows 1..totalRows,
      // columns A–D). The DTO regex guarantees shape; this guarantees range.
      for (const s of seats) {
        const row = Number(s.slice(0, -1));
        if (!Number.isInteger(row) || row < 1 || row > trip.totalRows) {
          apiError(400, `Seat ${s} does not exist on this bus.`);
        }
      }

      const clash = seats.filter((s) => trip.bookedSeats.includes(s));
      if (clash.length > 0) {
        apiError(409, `Seat ${clash.join(', ')} was just taken. Pick another.`);
      }

      // Atomic guard: the WHERE clause re-checks that none of the requested
      // seats are present in booked_seats at the moment of the write. If a
      // concurrent transaction won the race and committed first, this
      // UPDATE matches zero rows and we know to retry/fail cleanly.
      // Seat values are bound as parameters (sql.join) — never interpolated
      // into raw SQL text.
      const updated = await tx
        .update(trips)
        .set({ bookedSeats: sql`${trips.bookedSeats} || ${JSON.stringify(seats)}::jsonb` })
        .where(
          and(
            eq(trips.id, tripId),
            eq(trips.status, 'scheduled'),
            sql`NOT (${trips.bookedSeats} ?| ARRAY[${sql.join(
              seats.map((s) => sql`${s}`),
              sql`, `,
            )}]::text[])`,
          ),
        )
        .returning({ id: trips.id });

      if (updated.length === 0) {
        apiError(409, 'One or more selected seats were just taken. Pick another.');
      }

      const totalPrice = seats.length * Number(trip.price);
      const serviceFee = Math.round(totalPrice * SERVICE_FEE_RATE);
      const grandTotal = totalPrice + serviceFee;
      const ref = bookingRef();

      // Wallet payments must actually move money: atomic conditional debit,
      // 402 if the balance can't cover it. Non-wallet methods (esewa,
      // khalti, card, cash) have no gateway integration yet and are
      // recorded as external payments — they never touch the wallet.
      if (dto.method === 'wallet') {
        await debitWalletOrFail(tx, customerId, grandTotal.toFixed(2));
      }

      const [operator] = await tx
        .select({ name: users.name, businessName: users.businessName })
        .from(users)
        .where(eq(users.id, trip.operatorId))
        .limit(1);

      await tx.insert(tickets).values({
        id: id('tk'),
        customerId,
        operatorId: trip.operatorId,
        tripId: trip.id,
        bookingRef: ref,
        status: 'CONFIRMED',
        busSnapshot: {
          operator: operator?.businessName ?? operator?.name ?? 'Operator',
          from: trip.fromCity,
          to: trip.toCity,
          date: trip.date,
          departure: trip.departure,
          arrival: trip.arrival,
          type: trip.type,
        },
        seats,
        passengers: dto.passengers,
        totalPrice: totalPrice.toFixed(2),
        serviceFee: serviceFee.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
        method: dto.method,
      });

      await tx.insert(transactions).values({
        id: id('t'),
        userId: customerId,
        type: 'BUS',
        status: 'SUCCESS',
        amount: grandTotal.toFixed(2),
        currency: 'NPR',
        description: `Bus ticket · ${trip.fromCity} → ${trip.toCity}`,
        inbound: false,
      });

      return { bookingRef: ref };
    });
  }

  async myBookings(customerId: string) {
    const rows = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.customerId, customerId))
      .orderBy(desc(tickets.bookedAt));

    return rows.map((t) => this.toTicketDto(t));
  }

  async cancelBooking(customerId: string, ticketId: string, dto: CancelTicketDto) {
  const result = await this.db.transaction(async (tx) => {
    const [ticket] = await tx.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    if (!ticket) apiError(404, 'Booking not found.');
    if (ticket.customerId !== customerId) {
      throw new ForbiddenException('You can only cancel your own bookings.');
    }
    if (ticket.status === 'CANCELLED') return null;

    const policy = computeCancellationPolicy(ticket.busSnapshot.date, ticket.busSnapshot.departure);
    const refundAmount = Number(ticket.grandTotal) * policy.refundPercent;

    await tx.update(tickets)
      .set({ status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: dto.reason ?? null })
      .where(eq(tickets.id, ticketId));

    const [trip] = await tx.select().from(trips).where(eq(trips.id, ticket.tripId)).limit(1);
    if (trip) {
      const remaining = trip.bookedSeats.filter((s) => !ticket.seats.includes(s));
      await tx.update(trips).set({ bookedSeats: remaining }).where(eq(trips.id, trip.id));
    }

   if (refundAmount <= 0) {
      return { refundAmount: 0, policy, bookingRef: ticket.bookingRef };
    }

    const walletRefund = refundsToWallet(ticket.method);
    if (walletRefund) {
      await creditWallet(tx, customerId, refundAmount.toFixed(2));
    }

    await tx.insert(transactions).values({
      id: id('t'),
      userId: customerId,
      type: 'REFUND',
      status: walletRefund ? 'SUCCESS' : 'PENDING',
      amount: refundAmount.toFixed(2),
      currency: 'NPR',
      referenceType: 'BUS_TICKET',
      referenceId: ticketId,
      description: walletRefund
        ? `Refund · cancelled bus ticket ${ticket.bookingRef} (${policy.tier.toLowerCase()})`
        : `Refund · cancelled bus ticket ${ticket.bookingRef} (${policy.tier.toLowerCase()}) — will be returned to your original payment method`,
      inbound: true,
    });

    return { refundAmount, policy, walletRefund, bookingRef: ticket.bookingRef };
  });

 if (result && result.refundAmount > 0 && !result.walletRefund) {
    await this.notifications.notify({
      type: 'refund_pending',
      title: 'Refund awaiting processing',
      message: `NPR ${result.refundAmount} refund pending for bus ticket ${result.bookingRef} (external payment method).`,
      entityType: 'bus_ticket',
      entityId: ticketId,
    });
  }

  if (result) {
    await this.notifications.notifyUser(customerId, {
      type: result.refundAmount > 0 ? 'refund_processed' : 'booking_cancelled',
      title: result.refundAmount > 0 ? 'Bus ticket cancelled — refund on the way' : 'Bus ticket cancelled',
      message:
        result.refundAmount > 0
          ? `Your ${result.bookingRef} ticket was cancelled. NPR ${result.refundAmount.toFixed(2)} has been ${
              result.walletRefund ? 'credited to your wallet' : 'queued for refund to your original payment method'
            }.`
          : `Your ${result.bookingRef} ticket was cancelled. This fare wasn't refundable under the cancellation window.`,
      entityType: 'bus_ticket',
      entityId: ticketId,
    });
  }

  return { ok: true, refund: result };
}

  /* ───────────────────────────── Reviews ──────────────────────────────────
   * One review per ticket (unique on ticket_id), exactly mirroring the
   * one-review-per-record pattern used by hotel/food/grocery/ride/load
   * reviews. Gated on the same effectiveTicketStatus() a customer already
   * sees as "Completed" — not the raw DB column — so a trip becomes
   * reviewable the moment its departure date has passed, without waiting
   * on the nightly completePastTrips cron.
   */

  async submitReview(customerId: string, ticketId: string, dto: CreateTicketReviewDto) {
    const [ticket] = await this.db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    if (!ticket) apiError(404, 'Booking not found.');
    if (ticket.customerId !== customerId) {
      throw new ForbiddenException('You can only review your own bookings.');
    }
    if (this.effectiveTicketStatus(ticket) !== 'COMPLETED') {
      apiError(400, 'You can review a trip once it has been completed.');
    }

    const [existing] = await this.db
      .select()
      .from(ticketReviews)
      .where(eq(ticketReviews.ticketId, ticketId))
      .limit(1);
    if (existing) apiError(409, 'You already reviewed this trip.');

    const [review] = await this.db
      .insert(ticketReviews)
      .values({
        id: id('tkrv'),
        ticketId,
        operatorId: ticket.operatorId,
        customerId,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
      })
      .returning();
    return this.toTicketReviewDto(review);
  }

  /** null (not 404) when no review yet — frontend shows the form. */
  async myTicketReview(customerId: string, ticketId: string) {
    const [review] = await this.db
      .select()
      .from(ticketReviews)
      .where(eq(ticketReviews.ticketId, ticketId))
      .limit(1);
    if (!review || review.customerId !== customerId) return null;
    return this.toTicketReviewDto(review);
  }

     /**
   * Computes the *effective* status a customer should see, without relying
   * solely on the nightly completePastTrips cron having already run. The
   * cron is the source of truth for the stored DB value (and the one that
   * actually frees up the trip/route for operator-side reporting), but a
   * customer checking their tickets between midnight and the next 1:05am
   * sweep — or while the server simply wasn't running overnight — would
   * otherwise still see a CONFIRMED ticket for a trip that already
   * happened. This derives the same "completed" outcome at read time as a
   * belt-and-suspenders layer, purely for display; it never writes to the
   * database, so it can't race with or fight the cron job.
   */
  private effectiveTicketStatus(t: typeof tickets.$inferSelect): typeof t.status | 'COMPLETED' {
    if (t.status !== 'CONFIRMED') return t.status;
    const tripDate = t.busSnapshot.date;
    if (tripDate && tripDate < todayIso()) return 'COMPLETED';
    return t.status;
  }

  private toTicketDto(t: typeof tickets.$inferSelect) {
    return {
      id: t.id,
      bookingRef: t.bookingRef,
      status: this.effectiveTicketStatus(t),
      bus: t.busSnapshot,
      seats: t.seats,
      passengers: t.passengers,
      totalPrice: Number(t.totalPrice),
      serviceFee: Number(t.serviceFee),
      grandTotal: Number(t.grandTotal),
      method: t.method,
      bookedAt: t.bookedAt.toISOString(),
    };
  }

  private toTicketReviewDto(r: typeof ticketReviews.$inferSelect) {
    return {
      id: r.id,
      ticketId: r.ticketId,
      operatorId: r.operatorId,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
    };
  }

  /* ───────────────────────────── Operator-facing ─────────────────────── */

  async operatorFleet(operatorId: string) {
    return this.db.select().from(buses).where(eq(buses.operatorId, operatorId)).orderBy(desc(buses.createdAt));
  }

  async registerBus(operatorId: string, dto: RegisterBusDto) {
    await this.partnerDocuments.assertRequiredDocsUploaded(operatorId, 'bus_operator');
    const totalRows = dto.totalRows ?? Math.ceil(dto.totalSeats / 4);
    const [bus] = await this.db
      .insert(buses)
      .values({
        id: id('bus'),
        operatorId,
        busName: dto.busName,
        busNumber: dto.busNumber,
        registrationNo: dto.registrationNo,
        type: dto.type,
        fuelType: dto.fuelType,
        totalSeats: dto.totalSeats,
        totalRows,
        amenities: dto.amenities,
        isActive: true,
      })
      .returning();
      const [partner] = await this.db
  .select({ name: users.name, businessName: users.businessName })
  .from(users)
  .where(eq(users.id, operatorId))
  .limit(1);
await this.notifications.notify({
  type: 'business_created',
  title: 'New bus added',
  message: `${partner?.businessName ?? partner?.name ?? 'A partner'} added a new bus: "${bus.busName}" (${bus.busNumber}).`,
  entityType: 'partner',
  entityId: operatorId,
});
    return bus;
  }

  async deleteBus(operatorId: string, busId: string) {
    const [bus] = await this.db.select().from(buses).where(eq(buses.id, busId)).limit(1);
    if (!bus) apiError(404, 'Bus not found.');
    if (bus.operatorId !== operatorId) throw new ForbiddenException('Not your bus.');

    // Cascades (schedules -> trips) are handled by FK onDelete: 'cascade'.
    await this.db.delete(buses).where(eq(buses.id, busId));
    return { ok: true };
  }

  async operatorSchedules(operatorId: string) {
    const rows = await this.db
      .select()
      .from(schedules)
      .where(eq(schedules.operatorId, operatorId))
      .orderBy(desc(schedules.createdAt));

    if (rows.length === 0) return [];

    // One grouped query for every schedule's upcoming-trip count, not one
    // query PER schedule fired concurrently via Promise.all(rows.map(...)).
    // That N+1-with-concurrency shape meant an operator with a dozen
    // schedules opened a dozen simultaneous connections from the pool at
    // once — fragile under any real contention (a serverless Postgres
    // cold-starting after auto-suspend, in particular; see
    // database.module.ts's comments on that) and it's what surfaced as this
    // endpoint's flat, unhelpful 500. This is also strictly faster: one
    // round trip instead of N.
    const today = todayIso();
    const scheduleIds = rows.map((s) => s.id);
    const counts = await this.db
      .select({ scheduleId: trips.scheduleId, count: sql<number>`count(*)::int` })
      .from(trips)
      .where(and(inArray(trips.scheduleId, scheduleIds), eq(trips.status, 'scheduled'), gte(trips.date, today)))
      .groupBy(trips.scheduleId);
    const upcomingByScheduleId = new Map(counts.map((c) => [c.scheduleId, c.count]));

    return rows.map((s) => ({
      ...s,
      price: Number(s.price),
      upcomingTrips: upcomingByScheduleId.get(s.id) ?? 0,
    }));
  }

  async createSchedule(operatorId: string, dto: CreateScheduleDto) {
    await this.partnerDocuments.assertRequiredDocsUploaded(operatorId, 'bus_operator');
    const [bus] = await this.db.select().from(buses).where(eq(buses.id, dto.busId)).limit(1);
    if (!bus) apiError(400, 'Pick one of your buses for this schedule.');
    if (bus.operatorId !== operatorId) throw new ForbiddenException('Not your bus.');

    if (dto.frequency === 'once' && !dto.onceDate) {
      apiError(400, 'A one-time schedule needs a date.');
    }
    if (dto.frequency === 'weekly' && (!dto.operatingDays || dto.operatingDays.length === 0)) {
      apiError(400, 'A weekly schedule needs at least one operating day.');
    }

    const duration = durationBetween(dto.departureTime, dto.arrivalTime);

    const [schedule] = await this.db
      .insert(schedules)
      .values({
        id: id('sch'),
        operatorId,
        busId: bus.id,
        fromCity: dto.fromCity,
        toCity: dto.toCity,
        departure: dto.departureTime,
        arrival: dto.arrivalTime,
        duration,
        price: dto.price.toFixed(2),
        status: 'active',
        frequency: dto.frequency,
        operatingDays: dto.operatingDays ?? [],
        onceDate: dto.onceDate ?? null,
        validFrom: dto.validFrom ?? todayIso(),
        validUntil: dto.validUntil ?? null,
        busName: bus.busName,
        busType: bus.type,
        totalSeats: bus.totalSeats,
      })
      .returning();

    const generated = generateTripsForSchedule(schedule, bus.amenities);
    if (generated.length > 0) {
      await this.db.insert(trips).values(generated);
    }

    return { ...schedule, price: Number(schedule.price), upcomingTrips: generated.length };
  }

  async deleteSchedule(operatorId: string, scheduleId: string) {
    const [schedule] = await this.db.select().from(schedules).where(eq(schedules.id, scheduleId)).limit(1);
    if (!schedule) apiError(404, 'Schedule not found.');
    if (schedule.operatorId !== operatorId) throw new ForbiddenException('Not your schedule.');

    await this.db.delete(schedules).where(eq(schedules.id, scheduleId));
    return { ok: true };
  }

  async scheduleTrips(operatorId: string, scheduleId: string) {
    const [schedule] = await this.db.select().from(schedules).where(eq(schedules.id, scheduleId)).limit(1);
    if (!schedule) apiError(404, 'Schedule not found.');
    if (schedule.operatorId !== operatorId) throw new ForbiddenException('Not your schedule.');

    const rows = await this.db
      .select()
      .from(trips)
      .where(eq(trips.scheduleId, scheduleId))
      .orderBy(asc(trips.date));

    return rows.map((t) => ({
      id: t.id,
      scheduleId: t.scheduleId,
      busId: t.busId,
      fromCity: t.fromCity,
      toCity: t.toCity,
      date: t.date,
      departure: t.departure,
      arrival: t.arrival,
      duration: t.duration,
      price: Number(t.price),
      status: t.status,
      seatsLeft: t.totalSeats - t.bookedSeats.length,
      totalSeats: t.totalSeats,
    }));
  }

  async updateTripStatus(
    operatorId: string,
    tripId: string,
    status: 'scheduled' | 'cancelled' | 'completed',
  ) {
    const [trip] = await this.db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    if (!trip) apiError(404, 'Departure not found.');
    if (trip.operatorId !== operatorId) throw new ForbiddenException('Not your departure.');

    await this.db.update(trips).set({ status }).where(eq(trips.id, tripId));

    // If a departure is cancelled, every CONFIRMED ticket on it should be
    // refunded automatically — passengers shouldn't have to separately
    // discover and cancel a trip the operator already pulled.
    if (status === 'cancelled') {
      const affected = await this.db
        .select()
        .from(tickets)
        .where(and(eq(tickets.tripId, tripId), eq(tickets.status, 'CONFIRMED')));
for (const ticket of affected) {
        // Same refund policy as customer-initiated cancels: the wallet is
        // only credited when the money originally came out of the wallet.
        const walletRefund = refundsToWallet(ticket.method);
        await this.db.transaction(async (tx) => {
          await tx.update(tickets).set({ status: 'CANCELLED' }).where(eq(tickets.id, ticket.id));
          if (walletRefund) {
            await creditWallet(tx, ticket.customerId, ticket.grandTotal);
          }
          await tx.insert(transactions).values({
            id: id('t'),
            userId: ticket.customerId,
            type: 'REFUND',
            status: walletRefund ? 'SUCCESS' : 'PENDING',
            amount: ticket.grandTotal,
            currency: 'NPR',
            referenceType: 'BUS_TICKET',
            referenceId: ticket.id,
            description: walletRefund
              ? `Refund · operator cancelled departure (${ticket.bookingRef})`
              : `Refund · operator cancelled departure (${ticket.bookingRef}) — will be returned to your original payment method`,
            inbound: true,
          });
        });

        await this.notifications.notifyUser(ticket.customerId, {
          type: 'refund_processed',
          title: 'Your bus departure was cancelled',
          message: `The operator cancelled your ${ticket.bookingRef} departure. NPR ${ticket.grandTotal} has been ${
            walletRefund ? 'credited to your wallet' : 'queued for refund to your original payment method'
          }.`,
          entityType: 'bus_ticket',
          entityId: ticket.id,
        });
      }
    }

    return { ok: true };
  }

  async operatorBookings(operatorId: string) {
    const rows = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.operatorId, operatorId))
      .orderBy(desc(tickets.bookedAt));
    return rows.map((t) => this.toTicketDto(t));
  }

  async operatorMetrics(operatorId: string) {
    const ticketRows = await this.db.select().from(tickets).where(eq(tickets.operatorId, operatorId));
    const seatsSoldToday = ticketRows.reduce((n, t) => n + t.seats.length, 0);
    const [{ activeRoutes }] = await this.db
      .select({ activeRoutes: sql<number>`count(*)::int` })
      .from(schedules)
      .where(and(eq(schedules.operatorId, operatorId), eq(schedules.status, 'active')));
    const [{ fleetOnline }] = await this.db
      .select({ fleetOnline: sql<number>`count(*)::int` })
      .from(buses)
      .where(and(eq(buses.operatorId, operatorId), eq(buses.isActive, true)));
    const revenueToday = ticketRows.reduce((n, t) => n + Number(t.grandTotal), 0);
    const { average: rating } = await this.operatorReviewSummary(operatorId);

    return {
      seatsSoldToday,
      activeRoutes,
      fleetOnline,
      revenueToday,
      rating,
      // Real revenue/sales time-series requires bucketing tickets by day —
      // a worthwhile v2 enhancement once there's enough booking volume to
      // chart meaningfully. Empty here renders the dashboard's real
      // "no data yet" empty state rather than a fabricated curve.
      series: [] as { label: string; value: number }[],
    };
  }

  /* ── Reviews ── */

  /** Every review this operator has received — the "operator admin" reviews list. */
  async operatorReviews(operatorId: string) {
    const rows = await this.db
      .select({
        review: ticketReviews,
        customerName: users.name,
        bookingRef: tickets.bookingRef,
        busSnapshot: tickets.busSnapshot,
      })
      .from(ticketReviews)
      .innerJoin(users, eq(users.id, ticketReviews.customerId))
      .innerJoin(tickets, eq(tickets.id, ticketReviews.ticketId))
      .where(eq(ticketReviews.operatorId, operatorId))
      .orderBy(desc(ticketReviews.createdAt));

    return rows.map((r) => ({
      id: r.review.id,
      rating: r.review.rating,
      comment: r.review.comment,
      createdAt: r.review.createdAt.toISOString(),
      customerName: r.customerName,
      bookingRef: r.bookingRef,
      from: r.busSnapshot.from,
      to: r.busSnapshot.to,
      tripDate: r.busSnapshot.date,
    }));
  }

async operatorReviewSummary(operatorId: string) {
    const reviews = await this.operatorReviews(operatorId);
    const count = reviews.length;
    const average = count === 0 ? 0 : reviews.reduce((sum, r) => sum + r.rating, 0) / count;
    const distribution = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: reviews.filter((r) => r.rating === star).length,
    }));
    return { average: Math.round(average * 10) / 10, count, distribution };
  }

  /**
   * Daily + summary revenue across the operator's routes. Mirrors
   * HotelService.partnerRevenue's shape and policy exactly: "net profit"
   * equals totalPrice (what the operator keeps) — the 2% service fee
   * passengers pay on top is Zamzam's platform commission, broken out
   * separately (platformFee) purely for transparency, never deducted from
   * the operator's take. Cancelled tickets are excluded from revenue and
   * reported separately as refunded amounts.
   */
  async operatorRevenue(operatorId: string) {
    const ticketRows = await this.db.select().from(tickets).where(eq(tickets.operatorId, operatorId));
    const today = todayIso();
    const monthPrefix = today.slice(0, 7); // "YYYY-MM"

    type Bucket = {
      bookings: number;
      seats: number;
      grossRevenue: number;
      platformFee: number;
      netProfit: number;
      cancelled: number;
      refunded: number;
    };
    const emptyBucket = (): Bucket => ({
      bookings: 0,
      seats: 0,
      grossRevenue: 0,
      platformFee: 0,
      netProfit: 0,
      cancelled: 0,
      refunded: 0,
    });

    const byDate = new Map<string, Bucket>();
    for (const t of ticketRows) {
      const date = t.bookedAt.toISOString().slice(0, 10);
      const bucket = byDate.get(date) ?? emptyBucket();
      if (t.status !== 'CANCELLED') {
        bucket.bookings += 1;
        bucket.seats += t.seats.length;
        bucket.grossRevenue += Number(t.totalPrice);
        bucket.platformFee += Number(t.serviceFee);
        bucket.netProfit += Number(t.totalPrice);
      } else {
        bucket.cancelled += 1;
        bucket.refunded += Number(t.grandTotal);
      }
      byDate.set(date, bucket);
    }

    // Last 30 days, oldest first, zero-filled so the chart never has gaps.
    const daily: (Bucket & { date: string })[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      daily.push({ date: key, ...(byDate.get(key) ?? emptyBucket()) });
    }

    const confirmed = ticketRows.filter((t) => t.status !== 'CANCELLED');
    const cancelled = ticketRows.filter((t) => t.status === 'CANCELLED');
    const totalRevenue = confirmed.reduce((sum, t) => sum + Number(t.totalPrice), 0);
    const totalPlatformFee = confirmed.reduce((sum, t) => sum + Number(t.serviceFee), 0);
    const totalRefunded = cancelled.reduce((sum, t) => sum + Number(t.grandTotal), 0);

    return {
      summary: {
        todayRevenue: byDate.get(today)?.netProfit ?? 0,
        monthRevenue: confirmed
          .filter((t) => t.bookedAt.toISOString().slice(0, 7) === monthPrefix)
          .reduce((sum, t) => sum + Number(t.totalPrice), 0),
        totalRevenue,
        totalPlatformFee,
        totalRefunded,
        netProfit: totalRevenue,
        totalBookings: confirmed.length,
        totalCancelled: cancelled.length,
        avgBookingValue: confirmed.length ? totalRevenue / confirmed.length : 0,
      },
      daily,
    };
  }

  /**
   * A "route" isn't a stored entity — it's the distinct fromCity → toCity
   * pairs across the operator's published schedules, aggregated live with
   * upcoming departures and ticket sales rolled up per pair. See
   * OperatorRoutesPage.tsx.
   */
  async operatorRoutes(operatorId: string) {
    const scheduleRows = await this.db.select().from(schedules).where(eq(schedules.operatorId, operatorId));
    if (scheduleRows.length === 0) return [];

    const today = todayIso();
    const ticketRows = await this.db.select().from(tickets).where(eq(tickets.operatorId, operatorId));

    type RouteAgg = {
      fromCity: string;
      toCity: string;
      activeSchedules: number;
      buses: Set<string>;
      priceMin: number;
      priceMax: number;
    };
    const byRoute = new Map<string, RouteAgg>();
    for (const s of scheduleRows) {
      const key = `${s.fromCity}::${s.toCity}`;
      const agg = byRoute.get(key) ?? {
        fromCity: s.fromCity,
        toCity: s.toCity,
        activeSchedules: 0,
        buses: new Set<string>(),
        priceMin: Number(s.price),
        priceMax: Number(s.price),
      };
      if (s.status === 'active') agg.activeSchedules += 1;
      agg.buses.add(s.busName);
      agg.priceMin = Math.min(agg.priceMin, Number(s.price));
      agg.priceMax = Math.max(agg.priceMax, Number(s.price));
      byRoute.set(key, agg);
    }

    const upcomingByRoute = await this.db
      .select({ fromCity: trips.fromCity, toCity: trips.toCity, count: sql<number>`count(*)::int` })
      .from(trips)
      .where(and(eq(trips.operatorId, operatorId), eq(trips.status, 'scheduled'), gte(trips.date, today)))
      .groupBy(trips.fromCity, trips.toCity);
    const upcomingMap = new Map(upcomingByRoute.map((r) => [`${r.fromCity}::${r.toCity}`, r.count]));

    const salesByRoute = new Map<string, { ticketsSold: number; revenue: number }>();
    for (const t of ticketRows) {
      if (t.status === 'CANCELLED') continue;
      const key = `${t.busSnapshot.from}::${t.busSnapshot.to}`;
      const agg = salesByRoute.get(key) ?? { ticketsSold: 0, revenue: 0 };
      agg.ticketsSold += t.seats.length;
      agg.revenue += Number(t.totalPrice);
      salesByRoute.set(key, agg);
    }

    return Array.from(byRoute.entries()).map(([key, r]) => ({
      fromCity: r.fromCity,
      toCity: r.toCity,
      activeSchedules: r.activeSchedules,
      buses: Array.from(r.buses),
      priceMin: r.priceMin,
      priceMax: r.priceMax,
      upcomingDepartures: upcomingMap.get(key) ?? 0,
      ticketsSold: salesByRoute.get(key)?.ticketsSold ?? 0,
      revenue: salesByRoute.get(key)?.revenue ?? 0,
    }));
  }
}