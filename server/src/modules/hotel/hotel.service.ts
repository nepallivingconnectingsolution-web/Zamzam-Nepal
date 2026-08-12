import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { hotels, roomTypes, roomBookings, roomReviews, transactions, users } from '../../database/schema';
import { id, bookingRef } from '../../common/id';
import { creditWallet, debitWalletOrFail, refundsToWallet } from '../../common/wallet.util';
import { apiError } from '../../common/exceptions';
import { isValidDateRange, nightsBetween, todayIso } from './hotel-date.util';
import type {
  BookRoomDto,
  CreateHotelDto,
  CreateReviewDto,
  CreateRoomTypeDto,
  UpdateHotelDto,
  UpdateRoomTypeDto,
} from './dto/hotel.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PartnerDocumentsService } from '../partner-documents/partner-documents.service';


const SERVICE_FEE_RATE = 0.02;

@Injectable()
export class HotelService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database,  
  private readonly notifications: NotificationsService,
    private readonly partnerDocuments: PartnerDocumentsService,


) {}

  /* ───────────────────────────── Customer-facing ─────────────────────── */

  async search(city?: string) {
    const conditions = [eq(hotels.isActive, true)];
    if (city) conditions.push(ilike(hotels.city, `%${city}%`));

    const rows = await this.db
      .select({
        id: hotels.id,
        name: hotels.name,
        city: hotels.city,
        address: hotels.address,
        description: hotels.description,
        amenities: hotels.amenities,
        photos: hotels.photos,
        partnerName: users.name,
        businessName: users.businessName,
      })
      .from(hotels)
      .innerJoin(users, eq(users.id, hotels.partnerId))
      .where(and(...conditions))
      .orderBy(asc(hotels.name));

    // "From price" per hotel — cheapest active room type, so the list view
    // can show a starting price without N+1 queries per hotel.
    const fromPrices = await this.db
      .select({
        hotelId: roomTypes.hotelId,
        minPrice: sql<string>`min(${roomTypes.pricePerNight})`,
      })
      .from(roomTypes)
      .where(eq(roomTypes.isActive, true))
      .groupBy(roomTypes.hotelId);
    const priceByHotel = new Map(fromPrices.map((p) => [p.hotelId, Number(p.minPrice)]));

    return rows.map((h) => ({
      id: h.id,
      name: h.businessName ?? h.name,
      city: h.city,
      address: h.address,
      description: h.description,
      amenities: h.amenities,
      photos: h.photos,
      fromPrice: priceByHotel.get(h.id) ?? null,
      operator: h.businessName ?? h.partnerName ?? 'Hotel partner',
    }));
  }

  async detail(hotelId: string) {
    const [hotel] = await this.db.select().from(hotels).where(eq(hotels.id, hotelId)).limit(1);
    if (!hotel || !hotel.isActive) apiError(404, 'This hotel is no longer available.');

    const [partner] = await this.db
      .select({ name: users.name, businessName: users.businessName })
      .from(users)
      .where(eq(users.id, hotel.partnerId))
      .limit(1);

    const rooms = await this.db
      .select()
      .from(roomTypes)
      .where(and(eq(roomTypes.hotelId, hotelId), eq(roomTypes.isActive, true)))
      .orderBy(asc(roomTypes.pricePerNight));

    return {
      id: hotel.id,
      name: partner?.businessName ?? partner?.name ?? hotel.name,
      city: hotel.city,
      address: hotel.address,
      description: hotel.description,
      amenities: hotel.amenities,
      photos: hotel.photos,
      checkInTime: hotel.checkInTime,
      checkOutTime: hotel.checkOutTime,
      operator: partner?.businessName ?? partner?.name ?? 'Hotel partner',
      roomTypes: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        pricePerNight: Number(r.pricePerNight),
        totalRooms: r.totalRooms,
        maxGuests: r.maxGuests,
        amenities: r.amenities,
      })),
    };
  }

  /**
   * Counts how many rooms of this type are already booked for ANY night
   * inside [checkIn, checkOut). Two date ranges overlap iff
   * existing.checkIn < new.checkOut AND existing.checkOut > new.checkIn —
   * the standard interval-overlap test. Available = totalRooms - overlapCount.
   *
   * This single query is reused both for read-only availability display
   * and, critically, inside the booking transaction itself where it forms
   * the atomic guard against double-booking. It sums roomCount rather than
   * counting rows, since one booking row can now cover several rooms.
   */
  private async overlappingBookedCount(
    tx: Database,
    roomTypeId: string,
    checkIn: string,
    checkOut: string,
  ): Promise<number> {
    const [{ count }] = await tx
      .select({ count: sql<number>`coalesce(sum(${roomBookings.roomCount}), 0)::int` })
      .from(roomBookings)
      .where(
        and(
          eq(roomBookings.roomTypeId, roomTypeId),
          eq(roomBookings.status, 'CONFIRMED'),
          sql`${roomBookings.checkIn} < ${checkOut}`,
          sql`${roomBookings.checkOut} > ${checkIn}`,
        ),
      );
    return count;
  }

  async availability(roomTypeId: string, checkIn: string, checkOut: string) {
    if (!isValidDateRange(checkIn, checkOut)) {
      apiError(400, 'Check-out must be after check-in.');
    }
    const [room] = await this.db.select().from(roomTypes).where(eq(roomTypes.id, roomTypeId)).limit(1);
    if (!room) apiError(404, 'Room type not found.');

    const booked = await this.overlappingBookedCount(this.db, roomTypeId, checkIn, checkOut);
    const available = Math.max(0, room.totalRooms - booked);
    const nights = nightsBetween(checkIn, checkOut);

    return {
      available,
      totalRooms: room.totalRooms,
      nights,
      pricePerNight: Number(room.pricePerNight),
      totalPrice: nights * Number(room.pricePerNight),
    };
  }

  /**
   * Books `roomCount` room(s) of the given type for [checkIn, checkOut) as
   * a single booking row. Atomicity: the whole read-check-write happens
   * inside a single SQL transaction — Postgres's default READ COMMITTED
   * isolation plus the row-level work happening transactionally means two
   * concurrent requests for the last available room(s) serialize at the
   * database level rather than racing in application code, so the loser
   * reliably sees the winner's just-inserted row and gets a clean 409
   * instead of double-booking. This is the date-range analogue of the bus
   * seat-lock's single atomic UPDATE guard: here the check and the write
   * happen in the same transaction rather than the same statement, because
   * counting interval overlaps can't be expressed as a single WHERE-clause
   * row guard the way seat-array membership can.
   */
  async book(customerId: string, hotelId: string, dto: BookRoomDto) {
    if (!isValidDateRange(dto.checkIn, dto.checkOut)) {
      apiError(400, 'Check-out must be after check-in.');
    }
    if (dto.checkIn < todayIso()) {
      apiError(400, 'Check-in date cannot be in the past.');
    }

    const result = await this.db.transaction(async (tx) => {
      const [hotel] = await tx.select().from(hotels).where(eq(hotels.id, hotelId)).limit(1);
      if (!hotel || !hotel.isActive) apiError(404, 'This hotel is no longer available.');

      const [room] = await tx.select().from(roomTypes).where(eq(roomTypes.id, dto.roomTypeId)).limit(1);
      if (!room || room.hotelId !== hotelId || !room.isActive) {
        apiError(404, 'This room type is no longer available.');
      }
      if (dto.guests > room.maxGuests) {
        apiError(400, `This room sleeps up to ${room.maxGuests} guests.`);
      }

      const roomCount = dto.roomCount ?? 1;
      const booked = await this.overlappingBookedCount(tx, room.id, dto.checkIn, dto.checkOut);
      if (booked + roomCount > room.totalRooms) {
        const remaining = Math.max(0, room.totalRooms - booked);
        apiError(
          409,
          remaining > 0
            ? `Only ${remaining} room(s) of this type are available for the selected dates.`
            : 'No rooms of this type are available for the selected dates.',
        );
      }

      const nights = nightsBetween(dto.checkIn, dto.checkOut);
      const totalPrice = nights * Number(room.pricePerNight) * roomCount;
      const serviceFee = Math.round(totalPrice * SERVICE_FEE_RATE);
      const grandTotal = totalPrice + serviceFee;
      const ref = bookingRef();

      // Wallet payments must actually move money: atomic conditional debit,
      // 402 on insufficient balance. External methods never touch the wallet.
      if (dto.method === 'wallet') {
        await debitWalletOrFail(tx, customerId, grandTotal.toFixed(2));
      }

      const [partner] = await tx
        .select({ name: users.name, businessName: users.businessName })
        .from(users)
        .where(eq(users.id, hotel.partnerId))
        .limit(1);

      await tx.insert(roomBookings).values({
        id: id('rb'),
        customerId,
        hotelId,
        roomTypeId: room.id,
        bookingRef: ref,
        status: 'CONFIRMED',
        checkIn: dto.checkIn,
        checkOut: dto.checkOut,
        nights,
        roomCount,
        guests: dto.guests,
        guestName: dto.guestName,
        guestPhone: dto.guestPhone,
        hotelSnapshot: {
          hotelName: partner?.businessName ?? partner?.name ?? hotel.name,
          city: hotel.city,
          roomTypeName: room.name,
          pricePerNight: room.pricePerNight,
        },
        pricePerNight: room.pricePerNight,
        totalPrice: totalPrice.toFixed(2),
        serviceFee: serviceFee.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
        method: dto.method,
      });

      // Hotel bookings get their own transaction type so they're correctly
      // categorized in wallet history, distinct from bus/ride transactions.
      await tx.insert(transactions).values({
        id: id('t'),
        userId: customerId,
        type: 'HOTEL',
        status: 'SUCCESS',
        amount: grandTotal.toFixed(2),
        currency: 'NPR',
        description: `Hotel booking · ${hotel.name} · ${room.name}`,
        inbound: false,
      });

      return { bookingRef: ref, hotelName: hotel.name, roomName: room.name };
    });

    await this.notifications.notifyUser(customerId, {
      type: 'booking_confirmed',
      title: 'Booking confirmed',
      message: `Your booking ${result.bookingRef} for ${result.roomName} at ${result.hotelName} is confirmed.`,
      entityType: 'room_booking',
      entityId: result.bookingRef,
    });

    return { bookingRef: result.bookingRef };
  }

  async myBookings(customerId: string) {
    const rows = await this.db
      .select()
      .from(roomBookings)
      .where(eq(roomBookings.customerId, customerId))
      .orderBy(desc(roomBookings.bookedAt));
    return rows.map((b) => this.toBookingDto(b));
  }

  async cancelBooking(customerId: string, bookingId: string) {
    const [booking] = await this.db.select().from(roomBookings).where(eq(roomBookings.id, bookingId)).limit(1);
    if (!booking) apiError(404, 'Booking not found.');
    if (booking.customerId !== customerId) {
      throw new ForbiddenException('You can only cancel your own bookings.');
    }
    if (booking.status === 'CANCELLED') return { ok: true };

    await this.refundAndCancel(booking);
    return { ok: true };
  }

  /**
   * A guest may review a stay once: the booking must be theirs, still
   * CONFIRMED (a cancelled stay never happened), and check-in must have
   * already arrived — no rating a room before you've stayed in it. The
   * unique index on room_reviews.booking_id is the hard backstop against
   * double submission; this 409 just gives a friendlier message first.
   */
  async submitReview(customerId: string, bookingId: string, dto: CreateReviewDto) {
    const [booking] = await this.db.select().from(roomBookings).where(eq(roomBookings.id, bookingId)).limit(1);
    if (!booking) apiError(404, 'Booking not found.');
    if (booking.customerId !== customerId) {
      throw new ForbiddenException('You can only review your own bookings.');
    }
    if (booking.status === 'CANCELLED') apiError(400, 'Cancelled bookings cannot be reviewed.');
    if (booking.checkIn > todayIso()) apiError(400, 'You can review this stay once check-in has passed.');

    const [existing] = await this.db
      .select()
      .from(roomReviews)
      .where(eq(roomReviews.bookingId, bookingId))
      .limit(1);
    if (existing) apiError(409, 'You already reviewed this booking.');

    const [review] = await this.db
      .insert(roomReviews)
      .values({
        id: id('rv'),
        bookingId,
        hotelId: booking.hotelId,
        customerId,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
      })
      .returning();
    return this.toReviewDto(review);
  }

  /** Returns null (not a 404) when the guest hasn't reviewed this booking yet — the frontend treats that as "show the form". */
  async myReview(customerId: string, bookingId: string) {
    const [review] = await this.db
      .select()
      .from(roomReviews)
      .where(eq(roomReviews.bookingId, bookingId))
      .limit(1);
    if (!review || review.customerId !== customerId) return null;
    return this.toReviewDto(review);
  }

  private toReviewDto(r: typeof roomReviews.$inferSelect) {
    return {
      id: r.id,
      bookingId: r.bookingId,
      hotelId: r.hotelId,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
    };
  }

  /**
   * Partner-initiated cancellation — e.g. the hotel needs to void a
   * reservation (overbooking correction, guest no-show handled offline,
   * property issue). Same refund + unlock behaviour as a customer
   * cancelling their own booking; the only difference is the ownership
   * check runs against the partner's hotels instead of the customer id.
   * Cancelling flips status away from 'CONFIRMED', which is the only
   * status overlappingBookedCount() counts — so the room is immediately
   * bookable again for those dates, no separate "unlock" step needed.
   */
  async partnerCancelBooking(partnerId: string, bookingId: string) {
    const [booking] = await this.db.select().from(roomBookings).where(eq(roomBookings.id, bookingId)).limit(1);
    if (!booking) apiError(404, 'Booking not found.');

    await this.assertOwnedHotel(partnerId, booking.hotelId);
    if (booking.status === 'CANCELLED') return { ok: true };

    await this.refundAndCancel(booking);
    return { ok: true };
  }

  /** Shared by both cancellation paths: flip status, refund to the guest's wallet, log the refund transaction. */
  private async refundAndCancel(booking: typeof roomBookings.$inferSelect) {
    await this.db.transaction(async (tx) => {
      await tx.update(roomBookings).set({ status: 'CANCELLED' }).where(eq(roomBookings.id, booking.id));

      // Wallet is only credited when the booking was paid from the wallet —
      // crediting external-method bookings minted free balance on cancel.
      const walletRefund = refundsToWallet(booking.method);
      if (walletRefund) {
        await creditWallet(tx, booking.customerId, booking.grandTotal);
      }

      await tx.insert(transactions).values({
        id: id('t'),
        userId: booking.customerId,
        type: 'REFUND',
        status: walletRefund ? 'SUCCESS' : 'PENDING',
        amount: booking.grandTotal,
        currency: 'NPR',
        description: walletRefund
          ? `Refund · cancelled hotel booking ${booking.bookingRef}`
          : `Refund · cancelled hotel booking ${booking.bookingRef} — will be returned to your original payment method`,
        inbound: true,
      });
    });
  }

  private toBookingDto(
    b: typeof roomBookings.$inferSelect,
    account?: { name: string; email: string; mobile: string; kycStatus: string } | null,
  ) {
    return {
      id: b.id,
      bookingRef: b.bookingRef,
      status: b.status,
      hotel: b.hotelSnapshot,
      hotelId: b.hotelId,
      roomTypeId: b.roomTypeId,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      nights: b.nights,
      roomCount: b.roomCount,
      guests: b.guests,
      guestName: b.guestName,
      guestPhone: b.guestPhone,
      pricePerNight: Number(b.pricePerNight),
      totalPrice: Number(b.totalPrice),
      serviceFee: Number(b.serviceFee),
      grandTotal: Number(b.grandTotal),
      method: b.method,
      bookedAt: b.bookedAt.toISOString(),
      account: account
        ? { name: account.name, email: account.email, mobile: account.mobile, kycStatus: account.kycStatus }
        : null,
    };
  }

  /* ───────────────────────────── Partner-facing ───────────────────────── */

  async partnerHotels(partnerId: string) {
    return this.db.select().from(hotels).where(eq(hotels.partnerId, partnerId)).orderBy(desc(hotels.createdAt));
  }

  async createHotel(partnerId: string, dto: CreateHotelDto) {
    await this.partnerDocuments.assertRequiredDocsUploaded(partnerId, 'hotel');
    const [hotel] = await this.db
      .insert(hotels)
      .values({
        id: id('htl'),
        partnerId,
        name: dto.name,
        city: dto.city,
        address: dto.address,
        description: dto.description ?? null,
        amenities: dto.amenities ?? [],
        photos: dto.photos ?? [],
        checkInTime: dto.checkInTime ?? '12:00',
        checkOutTime: dto.checkOutTime ?? '11:00',
        isActive: true,
      })
      .returning();

    const [partner] = await this.db
      .select({ name: users.name, businessName: users.businessName })
      .from(users)
      .where(eq(users.id, partnerId))
      .limit(1);
    await this.notifications.notify({
      type: 'business_created',
      title: 'New hotel added',
      message: `${partner?.businessName ?? partner?.name ?? 'A partner'} added a new hotel: "${hotel.name}".`,
      entityType: 'partner',
      entityId: partnerId,
    });

    return hotel;
  }

  async updateHotel(partnerId: string, hotelId: string, dto: UpdateHotelDto) {
    const hotel = await this.assertOwnedHotel(partnerId, hotelId);
    const [updated] = await this.db
      .update(hotels)
      .set({
        name: dto.name,
        city: dto.city,
        address: dto.address,
        description: dto.description ?? null,
        amenities: dto.amenities ?? hotel.amenities,
        photos: dto.photos ?? hotel.photos,
        checkInTime: dto.checkInTime ?? hotel.checkInTime,
        checkOutTime: dto.checkOutTime ?? hotel.checkOutTime,
      })
      .where(eq(hotels.id, hotelId))
      .returning();
    return updated;
  }

  async deleteHotel(partnerId: string, hotelId: string) {
    await this.assertOwnedHotel(partnerId, hotelId);
    await this.db.delete(hotels).where(eq(hotels.id, hotelId));
    return { ok: true };
  }

  async hotelRoomTypes(partnerId: string, hotelId: string) {
    await this.assertOwnedHotel(partnerId, hotelId);
    return this.db
      .select()
      .from(roomTypes)
      .where(eq(roomTypes.hotelId, hotelId))
      .orderBy(asc(roomTypes.pricePerNight));
  }

  async createRoomType(partnerId: string, hotelId: string, dto: CreateRoomTypeDto) {
    await this.partnerDocuments.assertRequiredDocsUploaded(partnerId, 'hotel');
    await this.assertOwnedHotel(partnerId, hotelId);
    const [room] = await this.db
      .insert(roomTypes)
      .values({
        id: id('rt'),
        hotelId,
        name: dto.name,
        description: dto.description ?? null,
        pricePerNight: dto.pricePerNight.toFixed(2),
        totalRooms: dto.totalRooms,
        maxGuests: dto.maxGuests ?? 2,
        amenities: dto.amenities ?? [],
        isActive: true,
      })
      .returning();
    return { ...room, pricePerNight: Number(room.pricePerNight) };
  }

  async updateRoomType(partnerId: string, hotelId: string, roomTypeId: string, dto: UpdateRoomTypeDto) {
    await this.assertOwnedRoomType(partnerId, hotelId, roomTypeId);
    const [updated] = await this.db
      .update(roomTypes)
      .set({
        name: dto.name,
        description: dto.description ?? null,
        pricePerNight: dto.pricePerNight.toFixed(2),
        totalRooms: dto.totalRooms,
        maxGuests: dto.maxGuests ?? 2,
        amenities: dto.amenities ?? [],
      })
      .where(eq(roomTypes.id, roomTypeId))
      .returning();
    return { ...updated, pricePerNight: Number(updated.pricePerNight) };
  }

  async deleteRoomType(partnerId: string, hotelId: string, roomTypeId: string) {
    await this.assertOwnedRoomType(partnerId, hotelId, roomTypeId);
    await this.db.delete(roomTypes).where(eq(roomTypes.id, roomTypeId));
    return { ok: true };
  }

  async partnerBookings(partnerId: string) {
    const myHotels = await this.partnerHotels(partnerId);
    const hotelIds = myHotels.map((h) => h.id);
    if (hotelIds.length === 0) return [];

    const rows = await this.db
      .select({
        booking: roomBookings,
        account: {
          name: users.name,
          email: users.email,
          mobile: users.mobile,
          kycStatus: users.kycStatus,
        },
      })
      .from(roomBookings)
      .innerJoin(users, eq(users.id, roomBookings.customerId))
      .where(inArray(roomBookings.hotelId, hotelIds))
      .orderBy(desc(roomBookings.bookedAt));
    return rows.map((r) => this.toBookingDto(r.booking, r.account));
  }

  /** Single booking with full guest + account details, scoped to the partner's own hotels. */
  async partnerBookingDetail(partnerId: string, bookingId: string) {
    const [row] = await this.db
      .select({
        booking: roomBookings,
        account: {
          name: users.name,
          email: users.email,
          mobile: users.mobile,
          kycStatus: users.kycStatus,
        },
      })
      .from(roomBookings)
      .innerJoin(users, eq(users.id, roomBookings.customerId))
      .where(eq(roomBookings.id, bookingId))
      .limit(1);

    if (!row) apiError(404, 'Booking not found.');
    await this.assertOwnedHotel(partnerId, row.booking.hotelId);

    const [roomType] = await this.db
      .select()
      .from(roomTypes)
      .where(eq(roomTypes.id, row.booking.roomTypeId))
      .limit(1);

    return {
      ...this.toBookingDto(row.booking, row.account),
      roomType: roomType
        ? {
            id: roomType.id,
            name: roomType.name,
            description: roomType.description,
            maxGuests: roomType.maxGuests,
            amenities: roomType.amenities,
          }
        : null,
    };
  }

  async metrics(partnerId: string) {
    const bookings = await this.partnerBookings(partnerId);
    const today = todayIso();
    const bookingsToday = bookings.filter((b) => b.bookedAt.slice(0, 10) === today).length;
    const revenueMonth = bookings
      .filter((b) => b.status === 'CONFIRMED')
      .reduce((sum, b) => sum + b.grandTotal, 0);

    const { average } = await this.partnerReviewSummary(partnerId);

    return {
      bookingsToday,
      occupancy: 0,
      rating: average,
      revenueMonth,
      series: [] as { label: string; value: number }[],
    };
  }

  /** Every review left on any of the partner's hotels, newest first. */
  async partnerReviews(partnerId: string) {
    const myHotels = await this.partnerHotels(partnerId);
    const hotelIds = myHotels.map((h) => h.id);
    if (hotelIds.length === 0) return [];

    const rows = await this.db
      .select({
        review: roomReviews,
        guestName: users.name,
        bookingRef: roomBookings.bookingRef,
        hotelSnapshot: roomBookings.hotelSnapshot,
        checkIn: roomBookings.checkIn,
        checkOut: roomBookings.checkOut,
      })
      .from(roomReviews)
      .innerJoin(users, eq(users.id, roomReviews.customerId))
      .innerJoin(roomBookings, eq(roomBookings.id, roomReviews.bookingId))
      .where(inArray(roomReviews.hotelId, hotelIds))
      .orderBy(desc(roomReviews.createdAt));

    return rows.map((r) => ({
      id: r.review.id,
      rating: r.review.rating,
      comment: r.review.comment,
      createdAt: r.review.createdAt.toISOString(),
      guestName: r.guestName,
      bookingRef: r.bookingRef,
      hotelName: r.hotelSnapshot.hotelName,
      roomTypeName: r.hotelSnapshot.roomTypeName,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
    }));
  }

  /** Average rating, review count, and a 1–5 star histogram — feeds both the Reviews page and the dashboard KPI. */
  async partnerReviewSummary(partnerId: string) {
    const reviews = await this.partnerReviews(partnerId);
    const count = reviews.length;
    const average = count === 0 ? 0 : reviews.reduce((sum, r) => sum + r.rating, 0) / count;
    const distribution = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: reviews.filter((r) => r.rating === star).length,
    }));
    return { average: Math.round(average * 10) / 10, count, distribution };
  }

  /**
   * Daily + summary revenue for the partner's hotels. "Net profit" here
   * equals the room total (totalPrice): the 2% service fee guests pay on
   * top is Zamzam's platform commission, never the hotel's — it is broken
   * out separately (platformFee) purely for transparency, not deducted
   * from the hotel's take. Cancelled bookings are excluded from revenue
   * and reported separately as refunded amounts.
   */
  async partnerRevenue(partnerId: string) {
    const bookings = await this.partnerBookings(partnerId);
    const today = todayIso();
    const monthPrefix = today.slice(0, 7); // "YYYY-MM"

    type Bucket = {
      bookings: number;
      grossRevenue: number;
      platformFee: number;
      netProfit: number;
      cancelled: number;
      refunded: number;
    };
    const emptyBucket = (): Bucket => ({
      bookings: 0,
      grossRevenue: 0,
      platformFee: 0,
      netProfit: 0,
      cancelled: 0,
      refunded: 0,
    });

    const byDate = new Map<string, Bucket>();
    for (const b of bookings) {
      const date = b.bookedAt.slice(0, 10);
      const bucket = byDate.get(date) ?? emptyBucket();
      if (b.status === 'CONFIRMED') {
        bucket.bookings += 1;
        bucket.grossRevenue += b.totalPrice;
        bucket.platformFee += b.serviceFee;
        bucket.netProfit += b.totalPrice;
      } else {
        bucket.cancelled += 1;
        bucket.refunded += b.grandTotal;
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

    const confirmed = bookings.filter((b) => b.status === 'CONFIRMED');
    const cancelled = bookings.filter((b) => b.status === 'CANCELLED');
    const totalRevenue = confirmed.reduce((sum, b) => sum + b.totalPrice, 0);
    const totalPlatformFee = confirmed.reduce((sum, b) => sum + b.serviceFee, 0);
    const totalRefunded = cancelled.reduce((sum, b) => sum + b.grandTotal, 0);

    return {
      summary: {
        todayRevenue: byDate.get(today)?.netProfit ?? 0,
        monthRevenue: confirmed
          .filter((b) => b.bookedAt.slice(0, 7) === monthPrefix)
          .reduce((sum, b) => sum + b.totalPrice, 0),
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

  private async assertOwnedHotel(partnerId: string, hotelId: string) {
    const [hotel] = await this.db.select().from(hotels).where(eq(hotels.id, hotelId)).limit(1);
    if (!hotel) apiError(404, 'Hotel not found.');
    if (hotel.partnerId !== partnerId) throw new ForbiddenException('Not your hotel.');
    return hotel;
  }

  private async assertOwnedRoomType(partnerId: string, hotelId: string, roomTypeId: string) {
    await this.assertOwnedHotel(partnerId, hotelId);
    const [room] = await this.db.select().from(roomTypes).where(eq(roomTypes.id, roomTypeId)).limit(1);
    if (!room) apiError(404, 'Room type not found.');
    if (room.hotelId !== hotelId) apiError(404, 'Room type not found.');
    return room;
  }
}