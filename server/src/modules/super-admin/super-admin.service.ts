import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { and, desc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import {
  auditLogs,
  bids,
  buses,
  cmsContent,
  disputes,
  foodOrders,
  groceryOrders,
  groceryStores,
  hotels,
  loads,
  platformSettings,
  restaurants,
  rides,
  rideStatusEnum,
  roomBookings,
  superAdmins,
  tickets,
  transactions,
  txnTypeEnum,
  users,
  vehicles,
  wallets,
} from '../../database/schema';
import { apiError } from '../../common/exceptions';
import { creditWallet } from '../../common/wallet.util';
import { id } from '../../common/id';
import type { SuperAdminLoginDto, UpdateCmsDto, UpdateSettingsDto } from './dto/super-admin.dto';
import { SERVICE_REGISTRY } from './service-registry';
import { PasswordResetService } from '../../common/password-reset/password-reset.service';

const PARTNER_ROLES = ['bus_operator', 'hotel', 'restaurant', 'grocery', 'driver', 'freight'] as const;
const PARTNER_TYPE_LABEL: Record<(typeof PARTNER_ROLES)[number], string> = {
  bus_operator: 'Bus operator',
  hotel: 'Hotel partner',
  restaurant: 'Restaurant partner',
  grocery: 'Grocery partner',
  driver: 'Driver partner',
  freight: 'Freight partner',
};

@Injectable()
export class SuperAdminService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  async login(dto: SuperAdminLoginDto) {
    const [admin] = await this.db
      .select()
      .from(superAdmins)
      .where(eq(superAdmins.email, dto.email))
      .limit(1);

    if (!admin || !(await bcrypt.compare(dto.password, admin.passwordHash))) {
      apiError(401, 'Invalid credentials.');
    }

    const accessToken = await this.jwt.signAsync(
      { sub: admin.id, type: 'super_admin_access' },
      {
        secret: this.config.get<string>('SUPER_ADMIN_JWT_SECRET'),
        expiresIn: this.config.get<string>('SUPER_ADMIN_JWT_EXPIRES_IN'),
      },
    );

    await this.audit(admin.id, 'super_admin.login', null, null);

    return {
      accessToken,
      admin: { id: admin.id, name: admin.name, email: admin.email },
    };
  }

  /** Same generic-response contract as AuthService.forgotPassword — never reveals whether the email is a real admin account. */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const [admin] = await this.db
      .select({ id: superAdmins.id })
      .from(superAdmins)
      .where(eq(superAdmins.email, email))
      .limit(1);
    await this.passwordReset.requestOtp(email, admin ? { id: admin.id, type: 'super_admin' } : null);
    return { message: "If an account exists for that email, we've sent a reset code." };
  }

  async verifyResetOtp(email: string, otp: string): Promise<{ valid: true }> {
    const valid = await this.passwordReset.verifyOtp(email, otp);
    if (!valid) apiError(400, 'That code is incorrect or has expired.');
    return { valid: true };
  }

  async resetPassword(email: string, otp: string, newPassword: string): Promise<{ message: string }> {
    const consumed = await this.passwordReset.consumeOtp(email, otp);
    if (!consumed?.superAdminId) apiError(400, 'That code is incorrect or has expired.');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.db
      .update(superAdmins)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(superAdmins.id, consumed.superAdminId));

    await this.audit(consumed.superAdminId, 'super_admin.password_reset', null, null);

    return { message: 'Your password has been updated.' };
  }

  async metrics() {
    const [{ gmv }] = await this.db
      .select({ gmv: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
      .from(transactions)
      .where(eq(transactions.status, 'SUCCESS'));

    const [{ totalUsers }] = await this.db
      .select({ totalUsers: sql<number>`count(*)::int` })
      .from(users);

    const [{ openDisputes }] = await this.db
      .select({ openDisputes: sql<number>`count(*)::int` })
      .from(disputes)
      .where(eq(disputes.status, 'OPEN'));

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ newUsers24h }] = await this.db
      .select({ newUsers24h: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.createdAt} >= ${since24h}`);

    return {
      gmv: Number(gmv),
      activeTrips: 0,
      onlineDrivers: 0,
      newUsers24h,
      totalUsers,
      openDisputes,
      revenue30d: Number(gmv),
      currency: 'NPR' as const,
    };
  }

  async listUsers(q: string | undefined, limit: number, offset: number) {
    const conditions = q
      ? [or(ilike(users.name, `%${q}%`), ilike(users.mobile, `%${q}%`), ilike(users.email, `%${q}%`))]
      : [];

    const rows = await this.db
      .select({
        id: users.id,
        name: users.name,
        mobile: users.mobile,
        email: users.email,
        role: users.role,
        kycStatus: users.kycStatus,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(and(...conditions));

    return {
      items: rows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
      total,
      limit,
      offset,
    };
  }

  async listRegistrations() {
    const rows = await this.db
      .select({
        id: users.id,
        name: users.name,
        mobile: users.mobile,
        email: users.email,
        role: users.role,
        kycStatus: users.kycStatus,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.kycStatus, 'PENDING'))
      .orderBy(desc(users.createdAt));

    return { items: rows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })) };
  }

  async listDisputes(limit?: number) {
    const rows = await this.db
      .select({
        dispute: disputes,
        raiserName: users.name,
        raiserMobile: users.mobile,
      })
      .from(disputes)
      .leftJoin(users, eq(disputes.raisedByUserId, users.id))
      .orderBy(desc(disputes.createdAt))
      .limit(limit ?? 1000);

    return rows.map(({ dispute: d, raiserName, raiserMobile }) => ({
      id: d.id,
      subject: d.subject,
      status: d.status,
      amount: d.amount,
      raisedBy: raiserName ? { name: raiserName, mobile: raiserMobile } : null,
      createdAt: d.createdAt.toISOString(),
    }));
  }

  /** Marks a dispute resolved and records who did it in the audit log. */
  async resolveDispute(superAdminId: string, disputeId: string) {
    const [existing] = await this.db.select().from(disputes).where(eq(disputes.id, disputeId)).limit(1);
    if (!existing) apiError(404, 'Dispute not found.');
    if (existing.status === 'RESOLVED') return { ok: true };

    await this.db.update(disputes).set({ status: 'RESOLVED' }).where(eq(disputes.id, disputeId));
    await this.audit(superAdminId, 'super_admin.dispute.resolve', 'dispute', disputeId);
    return { ok: true };
  }

  /* ─────────────────── Platform transactions & wallet ────────────────── */

  /**
   * Full platform transaction ledger with search (description / user name /
   * mobile), optional type filter, and offset pagination. `type` is
   * validated against the enum here so a bad query string can never reach
   * the SQL layer.
   */
  async listTransactions(opts: { q?: string; type?: string; limit: number; offset: number }) {
    const conditions = [];

    if (opts.type && (txnTypeEnum.enumValues as readonly string[]).includes(opts.type)) {
      conditions.push(eq(transactions.type, opts.type as (typeof txnTypeEnum.enumValues)[number]));
    }
    if (opts.q) {
      const like = `%${opts.q}%`;
      conditions.push(
        or(ilike(transactions.description, like), ilike(users.name, like), ilike(users.mobile, like)),
      );
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await this.db
      .select({ txn: transactions, userName: users.name, userMobile: users.mobile })
      .from(transactions)
      .leftJoin(users, eq(transactions.userId, users.id))
      .where(where)
      .orderBy(desc(transactions.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(transactions)
      .leftJoin(users, eq(transactions.userId, users.id))
      .where(where);

    return {
      items: rows.map(({ txn: t, userName, userMobile }) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        amount: Number(t.amount),
        currency: t.currency,
        description: t.description,
        inbound: t.inbound,
        user: userName ? { name: userName, mobile: userMobile } : null,
        createdAt: t.createdAt.toISOString(),
      })),
      total,
    };
  }

  /** Platform float: wallet totals, 24h money movement, and largest wallets. */
  async walletOverview() {
    const [{ totalAvailable, totalEscrow, walletCount }] = await this.db
      .select({
        totalAvailable: sql<string>`coalesce(sum(${wallets.available}), 0)`,
        totalEscrow: sql<string>`coalesce(sum(${wallets.escrow}), 0)`,
        walletCount: sql<number>`count(*)::int`,
      })
      .from(wallets);

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ topups24h }] = await this.db
      .select({ topups24h: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.type, 'TOPUP'),
          eq(transactions.status, 'SUCCESS'),
          sql`${transactions.createdAt} >= ${since24h}`,
        ),
      );
    const [{ refunds24h }] = await this.db
      .select({ refunds24h: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.type, 'REFUND'),
          eq(transactions.status, 'SUCCESS'),
          sql`${transactions.createdAt} >= ${since24h}`,
        ),
      );

    const top = await this.db
      .select({ wallet: wallets, name: users.name, mobile: users.mobile, role: users.role })
      .from(wallets)
      .leftJoin(users, eq(wallets.userId, users.id))
      .orderBy(desc(wallets.available))
      .limit(10);

    return {
      totalAvailable: Number(totalAvailable),
      totalEscrow: Number(totalEscrow),
      walletCount,
      topups24h: Number(topups24h),
      refunds24h: Number(refunds24h),
      topWallets: top.map(({ wallet: w, name, mobile, role }) => ({
        userId: w.userId,
        available: Number(w.available),
        escrow: Number(w.escrow),
        user: name ? { name, mobile, role } : null,
        updatedAt: w.updatedAt.toISOString(),
      })),
    };
  }


  /**
   * Resolves a PENDING REFUND or TOPUP transaction that has no live payment
   * gateway behind it. REFUNDs never touch the wallet here — the money
   * already left the platform via the customer's original payment method,
   * this just records the outcome. TOPUPs are the opposite direction: no
   * money has moved yet, so a SUCCESS outcome is the one place that credits
   * the wallet, and it does so atomically with the status flip so the
   * ledger and balance can never disagree. See AUDIT_REPORT.md — "Wallet
   * top-up minted balance with zero verification."
   */
  async resolveTransaction(superAdminId: string, transactionId: string, outcome: 'SUCCESS' | 'FAILED') {
    const [pending] = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          inArray(transactions.type, ['REFUND', 'TOPUP']),
          eq(transactions.status, 'PENDING'),
        ),
      )
      .limit(1);
    if (!pending) apiError(404, 'No pending refund or top-up found with that id.');

    let txn = pending;
    if (pending.type === 'TOPUP' && outcome === 'SUCCESS') {
      await this.db.transaction(async (tx) => {
        await creditWallet(tx, pending.userId, pending.amount);
        [txn] = await tx
          .update(transactions)
          .set({ status: outcome })
          .where(eq(transactions.id, transactionId))
          .returning();
      });
    } else {
      [txn] = await this.db
        .update(transactions)
        .set({ status: outcome })
        .where(eq(transactions.id, transactionId))
        .returning();
    }

    await this.audit(
      superAdminId,
      pending.type === 'TOPUP' ? 'super_admin.topup.resolve' : 'super_admin.refund.resolve',
      'transaction',
      transactionId,
    );

    const isRefund = pending.type === 'REFUND';
    // 'topup_processed'/'topup_failed' aren't in the user_notification_type
    // enum (adding them needs a migration) — TOPUP outcomes reuse 'system'
    // and rely on the title/message below to stay unambiguous.
    await this.notifications.notifyUser(txn.userId, {
      type: isRefund ? (outcome === 'SUCCESS' ? 'refund_processed' : 'refund_failed') : 'system',
      title:
        outcome === 'SUCCESS'
          ? isRefund ? 'Refund processed' : 'Top-up confirmed'
          : isRefund ? 'Refund could not be processed' : 'Top-up could not be verified',
      message:
        outcome === 'SUCCESS'
          ? isRefund
            ? `NPR ${txn.amount} has been refunded to your original payment method.`
            : `NPR ${txn.amount} has been added to your wallet.`
          : isRefund
            ? `Your NPR ${txn.amount} refund could not be completed. Please contact support.`
            : `Your NPR ${txn.amount} top-up could not be verified. Please contact support.`,
      entityType: txn.referenceType ?? undefined,
      entityId: txn.referenceId ?? undefined,
    });

    return txn;
  }

  /* ───────────────────────── Rides & demand ─────────────────────────── */

  /**
   * Every ride/parcel across the platform with customer + driver joined.
   * users is joined twice (customer and driver), which requires an alias —
   * Postgres can't reference the same table name twice in one query.
   */
  async listRides(opts: { status?: string; service?: string; limit: number; offset: number }) {
    const drivers = alias(users, 'ride_drivers');

    const conditions = [];
    if (opts.status && (rideStatusEnum.enumValues as readonly string[]).includes(opts.status)) {
      conditions.push(eq(rides.status, opts.status as (typeof rideStatusEnum.enumValues)[number]));
    }
    if (opts.service) {
      conditions.push(eq(rides.service, opts.service));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await this.db
      .select({
        ride: rides,
        customerName: users.name,
        customerMobile: users.mobile,
        driverName: drivers.name,
        driverMobile: drivers.mobile,
      })
      .from(rides)
      .leftJoin(users, eq(rides.customerId, users.id))
      .leftJoin(drivers, eq(rides.driverId, drivers.id))
      .where(where)
      .orderBy(desc(rides.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(rides)
      .where(where);

    return {
      items: rows.map(({ ride: r, customerName, customerMobile, driverName, driverMobile }) => ({
        id: r.id,
        service: r.service,
        status: r.status,
        fromLabel: r.fromLabel,
        toLabel: r.toLabel,
        fare: Number(r.fare),
        distanceKm: r.distanceKm != null ? Number(r.distanceKm) : null,
        customer: customerName ? { name: customerName, mobile: customerMobile } : null,
        driver: driverName ? { name: driverName, mobile: driverMobile } : null,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
    };
  }

  /**
   * Demand analytics over the last 7 days, straight from the pickup
   * coordinates every booking already records:
   *  - cells: pickup density on a ~1.1 km grid (lat/lng rounded to 2dp)
   *  - byHour: bookings per hour of day (0-23), for staffing/surge planning
   *  - byService: split across taxi / bike / parcel etc.
   */
  async demandHeatmap() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const cells = await this.db
      .select({
        lat: sql<string>`round(${rides.pickupLat}, 2)`,
        lng: sql<string>`round(${rides.pickupLng}, 2)`,
        count: sql<number>`count(*)::int`,
      })
      .from(rides)
      .where(and(sql`${rides.createdAt} >= ${since}`, sql`${rides.pickupLat} is not null`))
      .groupBy(sql`round(${rides.pickupLat}, 2)`, sql`round(${rides.pickupLng}, 2)`)
      .orderBy(sql`count(*) desc`)
      .limit(50);

    const hourRows = await this.db
      .select({
        hour: sql<number>`extract(hour from ${rides.createdAt})::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(rides)
      .where(sql`${rides.createdAt} >= ${since}`)
      .groupBy(sql`extract(hour from ${rides.createdAt})`);

    // Always return all 24 buckets so the chart never has holes.
    const byHour = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: hourRows.find((r) => r.hour === h)?.count ?? 0,
    }));

    const byService = await this.db
      .select({ service: rides.service, count: sql<number>`count(*)::int` })
      .from(rides)
      .where(sql`${rides.createdAt} >= ${since}`)
      .groupBy(rides.service)
      .orderBy(sql`count(*) desc`);

    const [{ totalRides7d }] = await this.db
      .select({ totalRides7d: sql<number>`count(*)::int` })
      .from(rides)
      .where(sql`${rides.createdAt} >= ${since}`);

    return {
      totalRides7d,
      cells: cells.map((c) => ({ lat: Number(c.lat), lng: Number(c.lng), count: c.count })),
      byHour,
      byService,
    };
  }

  /* ─────────────────── Audit, roles & reports ────────────────────────── */

  /**
   * The audit trail: every privileged action, newest first, with the actor
   * resolved to a readable name. actorId can be a super admin OR a regular
   * user, so both tables are left-joined and actorType picks the label.
   */
  async listAuditLogs(opts: { q?: string; limit: number; offset: number }) {
    const conditions = [];
    if (opts.q) {
      const like = `%${opts.q}%`;
      conditions.push(or(ilike(auditLogs.action, like), ilike(auditLogs.targetId, like)));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await this.db
      .select({
        log: auditLogs,
        adminName: superAdmins.name,
        adminEmail: superAdmins.email,
        userName: users.name,
      })
      .from(auditLogs)
      .leftJoin(superAdmins, eq(auditLogs.actorId, superAdmins.id))
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where);

    return {
      items: rows.map(({ log: l, adminName, adminEmail, userName }) => ({
        id: l.id,
        actor:
          l.actorType === 'super_admin'
            ? { name: adminName ?? l.actorId, email: adminEmail, type: 'super_admin' as const }
            : { name: userName ?? l.actorId, email: null, type: 'user' as const },
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        createdAt: l.createdAt.toISOString(),
      })),
      total,
    };
  }

  /** Role distribution with per-role KYC breakdown, plus super admin count. */
  async rolesOverview() {
    const roles = await this.db
      .select({
        role: users.role,
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${users.kycStatus} = 'PENDING')::int`,
        approved: sql<number>`count(*) filter (where ${users.kycStatus} = 'APPROVED')::int`,
        suspended: sql<number>`count(*) filter (where ${users.kycStatus} = 'SUSPENDED')::int`,
      })
      .from(users)
      .groupBy(users.role)
      .orderBy(sql`count(*) desc`);

    const [{ superAdminCount }] = await this.db
      .select({ superAdminCount: sql<number>`count(*)::int` })
      .from(superAdmins);

    return { roles, superAdminCount };
  }

  /**
   * Cross-vertical activity + revenue report over the last N days.
   * Cancelled bookings/orders are excluded from both count and revenue —
   * a cancelled sale is not a sale.
   */
  async reports(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [bus] = await this.db
      .select({ count: sql<number>`count(*)::int`, revenue: sql<string>`coalesce(sum(${tickets.grandTotal}), 0)` })
      .from(tickets)
      .where(and(sql`${tickets.bookedAt} >= ${since}`, sql`${tickets.status} <> 'CANCELLED'`));

    const [hotel] = await this.db
      .select({ count: sql<number>`count(*)::int`, revenue: sql<string>`coalesce(sum(${roomBookings.grandTotal}), 0)` })
      .from(roomBookings)
      .where(and(sql`${roomBookings.bookedAt} >= ${since}`, sql`${roomBookings.status} <> 'CANCELLED'`));

    const [food] = await this.db
      .select({ count: sql<number>`count(*)::int`, revenue: sql<string>`coalesce(sum(${foodOrders.grandTotal}), 0)` })
      .from(foodOrders)
      .where(and(sql`${foodOrders.placedAt} >= ${since}`, sql`${foodOrders.status} <> 'CANCELLED'`));

    const [grocery] = await this.db
      .select({ count: sql<number>`count(*)::int`, revenue: sql<string>`coalesce(sum(${groceryOrders.grandTotal}), 0)` })
      .from(groceryOrders)
      .where(and(sql`${groceryOrders.placedAt} >= ${since}`, sql`${groceryOrders.status} <> 'CANCELLED'`));

    const [ride] = await this.db
      .select({ count: sql<number>`count(*)::int`, revenue: sql<string>`coalesce(sum(${rides.fare}), 0)` })
      .from(rides)
      .where(and(sql`${rides.createdAt} >= ${since}`, eq(rides.status, 'COMPLETED')));

    // Freight revenue is the accepted bid amount, not the customer's initial
    // budget ask — that's what the transporter is actually paid, and it's
    // only known once a load is delivered.
    const [freight] = await this.db
      .select({ count: sql<number>`count(*)::int`, revenue: sql<string>`coalesce(sum(${bids.amount}), 0)` })
      .from(loads)
      .innerJoin(bids, eq(loads.acceptedBidId, bids.id))
      .where(and(sql`${loads.updatedAt} >= ${since}`, eq(loads.status, 'DELIVERED')));

    const [topup] = await this.db
      .select({ count: sql<number>`count(*)::int`, revenue: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
      .from(transactions)
      .where(
        and(
          sql`${transactions.createdAt} >= ${since}`,
          eq(transactions.type, 'TOPUP'),
          eq(transactions.status, 'SUCCESS'),
        ),
      );

    const rows = [
      { vertical: 'Bus tickets', count: bus.count, revenue: Number(bus.revenue) },
      { vertical: 'Hotel bookings', count: hotel.count, revenue: Number(hotel.revenue) },
      { vertical: 'Food orders', count: food.count, revenue: Number(food.revenue) },
      { vertical: 'Grocery orders', count: grocery.count, revenue: Number(grocery.revenue) },
      { vertical: 'Completed rides', count: ride.count, revenue: Number(ride.revenue) },
      { vertical: 'Freight shipments', count: freight.count, revenue: Number(freight.revenue) },
      { vertical: 'Wallet top-ups', count: topup.count, revenue: Number(topup.revenue) },
    ];

    return {
      periodDays: days,
      generatedAt: new Date().toISOString(),
      rows,
      totals: {
        count: rows.reduce((n, r) => n + r.count, 0),
        revenue: rows.filter((r) => r.vertical !== 'Wallet top-ups').reduce((n, r) => n + r.revenue, 0),
      },
    };
  }

  async userDetail(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) apiError(404, 'User not found.');

    const [wallet] = await this.db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
    const txns = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt))
      .limit(50);

    return {
      user: {
        id: user.id,
        name: user.name,
        mobile: user.mobile,
        email: user.email,
        role: user.role,
        kycStatus: user.kycStatus,
        createdAt: user.createdAt.toISOString(),
        businessName: user.businessName,
        businessAddress: user.businessAddress,
      },
      wallet: wallet
        ? { available: Number(wallet.available), escrow: Number(wallet.escrow), currency: wallet.currency }
        : null,
      transactions: txns.map((t) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        amount: Number(t.amount),
        currency: t.currency,
        description: t.description,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  /* ─────────────────────── Partners (all business verticals) ───────────
   * The 360° view across every partner-facing business — bus operators,
   * hotels, restaurants, grocery stores, drivers, and freight transporters.
   * Each already reports its own bookings/orders and revenue on its own
   * partner dashboard; this rolls all of them up into one place so the
   * super admin never has to log into a partner portal to see activity,
   * who's ordering, or what a partner has earned.
   */
  async listPartners() {
    const [
      operatorRows, hotelRows, restaurantRows, groceryRows,
      busStats, busUnitCounts,
      hotelStats, hotelUnitCounts,
      restaurantStats, restaurantUnitCounts,
      groceryStats, groceryUnitCounts,
      driverRows, driverStats, driverUnitCounts,
      freightRows, freightStats,
    ] = await Promise.all([
      this.db
        .select({
          id: users.id, name: users.name, email: users.email, mobile: users.mobile,
          businessName: users.businessName, businessAddress: users.businessAddress,
          kycStatus: users.kycStatus, createdAt: users.createdAt,
        })
        .from(users).where(eq(users.role, 'bus_operator')).orderBy(desc(users.createdAt)),
      this.db
        .select({
          id: users.id, name: users.name, email: users.email, mobile: users.mobile,
          businessName: users.businessName, businessAddress: users.businessAddress,
          kycStatus: users.kycStatus, createdAt: users.createdAt,
        })
        .from(users).where(eq(users.role, 'hotel')).orderBy(desc(users.createdAt)),
      this.db
        .select({
          id: users.id, name: users.name, email: users.email, mobile: users.mobile,
          businessName: users.businessName, businessAddress: users.businessAddress,
          kycStatus: users.kycStatus, createdAt: users.createdAt,
        })
        .from(users).where(eq(users.role, 'restaurant')).orderBy(desc(users.createdAt)),
      this.db
        .select({
          id: users.id, name: users.name, email: users.email, mobile: users.mobile,
          businessName: users.businessName, businessAddress: users.businessAddress,
          kycStatus: users.kycStatus, createdAt: users.createdAt,
        })
        .from(users).where(eq(users.role, 'grocery')).orderBy(desc(users.createdAt)),

      this.db
        .select({
          operatorId: tickets.operatorId,
          totalBookings: sql<number>`count(*) filter (where ${tickets.status} = 'CONFIRMED')::int`,
          totalRevenue: sql<string>`coalesce(sum(${tickets.grandTotal}) filter (where ${tickets.status} = 'CONFIRMED'), 0)`,
          totalCustomers: sql<number>`count(distinct ${tickets.customerId}) filter (where ${tickets.status} = 'CONFIRMED')::int`,
        })
        .from(tickets).groupBy(tickets.operatorId),
      this.db.select({ operatorId: buses.operatorId, count: sql<number>`count(*)::int` }).from(buses).groupBy(buses.operatorId),

      this.db
        .select({
          partnerId: hotels.partnerId,
          totalBookings: sql<number>`count(*) filter (where ${roomBookings.status} = 'CONFIRMED')::int`,
          totalRevenue: sql<string>`coalesce(sum(${roomBookings.totalPrice}) filter (where ${roomBookings.status} = 'CONFIRMED'), 0)`,
          totalCustomers: sql<number>`count(distinct ${roomBookings.customerId}) filter (where ${roomBookings.status} = 'CONFIRMED')::int`,
        })
        .from(roomBookings).innerJoin(hotels, eq(hotels.id, roomBookings.hotelId)).groupBy(hotels.partnerId),
      this.db.select({ partnerId: hotels.partnerId, count: sql<number>`count(*)::int` }).from(hotels).groupBy(hotels.partnerId),

      this.db
        .select({
          partnerId: restaurants.partnerId,
          totalBookings: sql<number>`count(*) filter (where ${foodOrders.status} = 'DELIVERED')::int`,
          totalRevenue: sql<string>`coalesce(sum(${foodOrders.grandTotal}) filter (where ${foodOrders.status} = 'DELIVERED'), 0)`,
          totalCustomers: sql<number>`count(distinct ${foodOrders.customerId}) filter (where ${foodOrders.status} = 'DELIVERED')::int`,
        })
        .from(foodOrders).innerJoin(restaurants, eq(restaurants.id, foodOrders.restaurantId)).groupBy(restaurants.partnerId),
      this.db.select({ partnerId: restaurants.partnerId, count: sql<number>`count(*)::int` }).from(restaurants).groupBy(restaurants.partnerId),

      this.db
        .select({
          partnerId: groceryStores.partnerId,
          totalBookings: sql<number>`count(*) filter (where ${groceryOrders.status} = 'DELIVERED')::int`,
          totalRevenue: sql<string>`coalesce(sum(${groceryOrders.grandTotal}) filter (where ${groceryOrders.status} = 'DELIVERED'), 0)`,
          totalCustomers: sql<number>`count(distinct ${groceryOrders.customerId}) filter (where ${groceryOrders.status} = 'DELIVERED')::int`,
        })
        .from(groceryOrders).innerJoin(groceryStores, eq(groceryStores.id, groceryOrders.storeId)).groupBy(groceryStores.partnerId),
      this.db.select({ partnerId: groceryStores.partnerId, count: sql<number>`count(*)::int` }).from(groceryStores).groupBy(groceryStores.partnerId),

      // Mobility providers: drivers power rides, bike, taxi, parcel — they
      // belong on this page like every other provider on the platform.
      this.db
        .select({
          id: users.id, name: users.name, email: users.email, mobile: users.mobile,
          businessName: users.businessName, businessAddress: users.businessAddress,
          kycStatus: users.kycStatus, createdAt: users.createdAt,
        })
        .from(users).where(eq(users.role, 'driver')).orderBy(desc(users.createdAt)),
      this.db
        .select({
          driverId: rides.driverId,
          totalBookings: sql<number>`count(*) filter (where ${rides.status} = 'COMPLETED')::int`,
          totalRevenue: sql<string>`coalesce(sum(${rides.fare}) filter (where ${rides.status} = 'COMPLETED'), 0)`,
          totalCustomers: sql<number>`count(distinct ${rides.customerId}) filter (where ${rides.status} = 'COMPLETED')::int`,
        })
        .from(rides).groupBy(rides.driverId),
      this.db.select({ driverId: vehicles.driverId, count: sql<number>`count(*)::int` }).from(vehicles).groupBy(vehicles.driverId),

      // Freight transporters: same 'vehicles' table as drivers (keyed by
      // driverId regardless of role), so driverUnitCounts above is reused
      // for their vehicle count too — see freightUnitsMap below.
      this.db
        .select({
          id: users.id, name: users.name, email: users.email, mobile: users.mobile,
          businessName: users.businessName, businessAddress: users.businessAddress,
          kycStatus: users.kycStatus, createdAt: users.createdAt,
        })
        .from(users).where(eq(users.role, 'freight')).orderBy(desc(users.createdAt)),
      this.db
        .select({
          transporterId: bids.transporterId,
          totalBookings: sql<number>`count(*) filter (where ${loads.status} = 'DELIVERED')::int`,
          totalRevenue: sql<string>`coalesce(sum(${bids.amount}) filter (where ${loads.status} = 'DELIVERED'), 0)`,
          totalCustomers: sql<number>`count(distinct ${loads.customerId}) filter (where ${loads.status} = 'DELIVERED')::int`,
        })
        .from(loads).innerJoin(bids, eq(loads.acceptedBidId, bids.id)).groupBy(bids.transporterId),
    ]);

    const busStatsMap = new Map(busStats.map((r) => [r.operatorId, r]));
    const busUnitsMap = new Map(busUnitCounts.map((r) => [r.operatorId, r.count]));
    const hotelStatsMap = new Map(hotelStats.map((r) => [r.partnerId, r]));
    const hotelUnitsMap = new Map(hotelUnitCounts.map((r) => [r.partnerId, r.count]));
    const restaurantStatsMap = new Map(restaurantStats.map((r) => [r.partnerId, r]));
    const restaurantUnitsMap = new Map(restaurantUnitCounts.map((r) => [r.partnerId, r.count]));
    const groceryStatsMap = new Map(groceryStats.map((r) => [r.partnerId, r]));
    const groceryUnitsMap = new Map(groceryUnitCounts.map((r) => [r.partnerId, r.count]));
    const driverStatsMap = new Map(
      driverStats.filter((r) => r.driverId).map((r) => [r.driverId as string, r]),
    );
    const driverUnitsMap = new Map(driverUnitCounts.map((r) => [r.driverId, r.count]));
    const freightStatsMap = new Map(
      freightStats.filter((r) => r.transporterId).map((r) => [r.transporterId as string, r]),
    );

    const buildRow = <T extends (typeof PARTNER_ROLES)[number]>(
      u: (typeof operatorRows)[number],
      type: T,
      statsMap: Map<string, { totalBookings: number; totalCustomers: number; totalRevenue: string }>,
      unitsMap: Map<string, number>,
      unitsLabel: string,
    ) => {
      const stats = statsMap.get(u.id);
      return {
        id: u.id,
        type,
        typeLabel: PARTNER_TYPE_LABEL[type],
        name: u.name,
        businessName: u.businessName,
        businessAddress: u.businessAddress,
        email: u.email,
        mobile: u.mobile,
        kycStatus: u.kycStatus,
        createdAt: u.createdAt.toISOString(),
        unitsCount: unitsMap.get(u.id) ?? 0,
        unitsLabel,
        totalBookings: stats?.totalBookings ?? 0,
        totalCustomers: stats?.totalCustomers ?? 0,
        totalRevenue: Number(stats?.totalRevenue ?? 0),
      };
    };

    const operators = operatorRows.map((u) => buildRow(u, 'bus_operator', busStatsMap, busUnitsMap, 'buses'));
    const hotelPartners = hotelRows.map((u) => buildRow(u, 'hotel', hotelStatsMap, hotelUnitsMap, 'properties'));
    const restaurantPartners = restaurantRows.map((u) => buildRow(u, 'restaurant', restaurantStatsMap, restaurantUnitsMap, 'restaurants'));
    const groceryPartners = groceryRows.map((u) => buildRow(u, 'grocery', groceryStatsMap, groceryUnitsMap, 'stores'));
    const drivers = driverRows.map((u) => buildRow(u, 'driver', driverStatsMap, driverUnitsMap, 'vehicles'));
    // Freight transporters store their vehicles in the same table as
    // drivers (vehicles.driverId), so driverUnitsMap covers them too.
    const freightPartners = freightRows.map((u) => buildRow(u, 'freight', freightStatsMap, driverUnitsMap, 'vehicles'));

    const items = [...operators, ...hotelPartners, ...restaurantPartners, ...groceryPartners, ...drivers, ...freightPartners].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return {
      items,
      summary: {
        totalPartners: items.length,
        busOperators: operators.length,
        hotelPartners: hotelPartners.length,
        restaurantPartners: restaurantPartners.length,
        groceryPartners: groceryPartners.length,
        drivers: drivers.length,
        freightPartners: freightPartners.length,
        combinedBookings: items.reduce((n, p) => n + p.totalBookings, 0),
        combinedRevenue: items.reduce((n, p) => n + p.totalRevenue, 0),
      },
    };
  }

  /** One partner's full booking/order + customer detail, scoped to their own business. */
  async partnerDetail(partnerId: string) {
    const [partner] = await this.db.select().from(users).where(eq(users.id, partnerId)).limit(1);
    if (!partner) apiError(404, 'Partner not found.');
    if (!PARTNER_ROLES.includes(partner.role as (typeof PARTNER_ROLES)[number])) {
      apiError(400, 'This account is not a bus operator, hotel, restaurant, grocery, or driver partner.');
    }

    if (partner.role === 'bus_operator') {
      const [unitsCountRow] = await this.db
        .select({ count: sql<number>`count(*)::int` }).from(buses).where(eq(buses.operatorId, partnerId));

      const rows = await this.db
        .select({ ticket: tickets, customerName: users.name, customerMobile: users.mobile, customerEmail: users.email })
        .from(tickets)
        .innerJoin(users, eq(users.id, tickets.customerId))
        .where(eq(tickets.operatorId, partnerId))
        .orderBy(desc(tickets.bookedAt))
        .limit(200);

      const confirmed = rows.filter((r) => r.ticket.status === 'CONFIRMED' || r.ticket.status === 'COMPLETED');

      return {
        partner: this.toPartnerHeaderDto(partner, 'bus_operator', unitsCountRow?.count ?? 0, 'buses'),
        stats: {
          totalBookings: confirmed.length,
          totalCustomers: new Set(confirmed.map((r) => r.ticket.customerId)).size,
          totalRevenue: confirmed.reduce((sum, r) => sum + Number(r.ticket.grandTotal), 0),
        },
        bookings: rows.map((r) => ({
          id: r.ticket.id,
          bookingRef: r.ticket.bookingRef,
          description: `${r.ticket.busSnapshot.from} → ${r.ticket.busSnapshot.to} · ${r.ticket.busSnapshot.date}`,
          customerName: r.customerName, customerMobile: r.customerMobile, customerEmail: r.customerEmail,
          amount: Number(r.ticket.grandTotal), status: r.ticket.status, bookedAt: r.ticket.bookedAt.toISOString(),
        })),
      };
    }

    if (partner.role === 'hotel') {
      const [unitsCountRow] = await this.db
        .select({ count: sql<number>`count(*)::int` }).from(hotels).where(eq(hotels.partnerId, partnerId));

      const rows = await this.db
        .select({ booking: roomBookings, customerName: users.name, customerMobile: users.mobile, customerEmail: users.email })
        .from(roomBookings)
        .innerJoin(hotels, eq(hotels.id, roomBookings.hotelId))
        .innerJoin(users, eq(users.id, roomBookings.customerId))
        .where(eq(hotels.partnerId, partnerId))
        .orderBy(desc(roomBookings.bookedAt))
        .limit(200);

      const confirmed = rows.filter((r) => r.booking.status === 'CONFIRMED');

      return {
        partner: this.toPartnerHeaderDto(partner, 'hotel', unitsCountRow?.count ?? 0, 'properties'),
        stats: {
          totalBookings: confirmed.length,
          totalCustomers: new Set(confirmed.map((r) => r.booking.customerId)).size,
          totalRevenue: confirmed.reduce((sum, r) => sum + Number(r.booking.totalPrice), 0),
        },
        bookings: rows.map((r) => ({
          id: r.booking.id,
          bookingRef: r.booking.bookingRef,
          description: `${r.booking.hotelSnapshot.hotelName} · ${r.booking.checkIn} → ${r.booking.checkOut}`,
          customerName: r.customerName, customerMobile: r.customerMobile, customerEmail: r.customerEmail,
          amount: Number(r.booking.grandTotal), status: r.booking.status, bookedAt: r.booking.bookedAt.toISOString(),
        })),
      };
    }

    if (partner.role === 'restaurant') {
      const [unitsCountRow] = await this.db
        .select({ count: sql<number>`count(*)::int` }).from(restaurants).where(eq(restaurants.partnerId, partnerId));

      const rows = await this.db
        .select({ order: foodOrders, customerName: users.name, customerMobile: users.mobile, customerEmail: users.email })
        .from(foodOrders)
        .innerJoin(restaurants, eq(restaurants.id, foodOrders.restaurantId))
        .innerJoin(users, eq(users.id, foodOrders.customerId))
        .where(eq(restaurants.partnerId, partnerId))
        .orderBy(desc(foodOrders.placedAt))
        .limit(200);

      const confirmed = rows.filter((r) => r.order.status === 'DELIVERED');

      return {
        partner: this.toPartnerHeaderDto(partner, 'restaurant', unitsCountRow?.count ?? 0, 'restaurants'),
        stats: {
          totalBookings: confirmed.length,
          totalCustomers: new Set(confirmed.map((r) => r.order.customerId)).size,
          totalRevenue: confirmed.reduce((sum, r) => sum + Number(r.order.grandTotal), 0),
        },
        bookings: rows.map((r) => ({
          id: r.order.id,
          bookingRef: r.order.orderRef,
          description: `${r.order.restaurantSnapshot.restaurantName} · ${r.order.fulfillment}`,
          customerName: r.customerName, customerMobile: r.customerMobile, customerEmail: r.customerEmail,
          amount: Number(r.order.grandTotal), status: r.order.status, bookedAt: r.order.placedAt.toISOString(),
        })),
      };
    }

    if (partner.role === 'driver') {
      const [unitsCountRow] = await this.db
        .select({ count: sql<number>`count(*)::int` }).from(vehicles).where(eq(vehicles.driverId, partnerId));

      const rows = await this.db
        .select({ ride: rides, customerName: users.name, customerMobile: users.mobile, customerEmail: users.email })
        .from(rides)
        .innerJoin(users, eq(users.id, rides.customerId))
        .where(eq(rides.driverId, partnerId))
        .orderBy(desc(rides.createdAt))
        .limit(200);

      const confirmed = rows.filter((r) => r.ride.status === 'COMPLETED');

      return {
        partner: this.toPartnerHeaderDto(partner, 'driver', unitsCountRow?.count ?? 0, 'vehicles'),
        stats: {
          totalBookings: confirmed.length,
          totalCustomers: new Set(confirmed.map((r) => r.ride.customerId)).size,
          totalRevenue: confirmed.reduce((sum, r) => sum + Number(r.ride.fare), 0),
        },
        bookings: rows.map((r) => ({
          id: r.ride.id,
          bookingRef: r.ride.id,
          description: `${r.ride.fromLabel} → ${r.ride.toLabel} · ${r.ride.service}`,
          customerName: r.customerName, customerMobile: r.customerMobile, customerEmail: r.customerEmail,
          amount: Number(r.ride.fare), status: r.ride.status, bookedAt: r.ride.createdAt.toISOString(),
        })),
      };
    }

    if (partner.role === 'freight') {
      // Freight transporters keep their vehicles in the same table as
      // drivers (vehicles.driverId), same as the units query above.
      const [unitsCountRow] = await this.db
        .select({ count: sql<number>`count(*)::int` }).from(vehicles).where(eq(vehicles.driverId, partnerId));

      const rows = await this.db
        .select({ load: loads, bid: bids, customerName: users.name, customerMobile: users.mobile, customerEmail: users.email })
        .from(bids)
        .innerJoin(loads, eq(loads.acceptedBidId, bids.id))
        .innerJoin(users, eq(users.id, loads.customerId))
        .where(eq(bids.transporterId, partnerId))
        .orderBy(desc(loads.updatedAt))
        .limit(200);

      const confirmed = rows.filter((r) => r.load.status === 'DELIVERED');

      return {
        partner: this.toPartnerHeaderDto(partner, 'freight', unitsCountRow?.count ?? 0, 'vehicles'),
        stats: {
          totalBookings: confirmed.length,
          totalCustomers: new Set(confirmed.map((r) => r.load.customerId)).size,
          totalRevenue: confirmed.reduce((sum, r) => sum + Number(r.bid.amount), 0),
        },
        bookings: rows.map((r) => ({
          id: r.load.id,
          bookingRef: r.load.id,
          description: `${r.load.fromLabel} → ${r.load.toLabel} · ${r.load.weightKg} kg`,
          customerName: r.customerName, customerMobile: r.customerMobile, customerEmail: r.customerEmail,
          amount: Number(r.bid.amount), status: r.load.status, bookedAt: r.load.updatedAt.toISOString(),
        })),
      };
    }

    // grocery partner
    const [unitsCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` }).from(groceryStores).where(eq(groceryStores.partnerId, partnerId));

    const rows = await this.db
      .select({ order: groceryOrders, customerName: users.name, customerMobile: users.mobile, customerEmail: users.email })
      .from(groceryOrders)
      .innerJoin(groceryStores, eq(groceryStores.id, groceryOrders.storeId))
      .innerJoin(users, eq(users.id, groceryOrders.customerId))
      .where(eq(groceryStores.partnerId, partnerId))
      .orderBy(desc(groceryOrders.placedAt))
      .limit(200);

    const confirmed = rows.filter((r) => r.order.status === 'DELIVERED');

    return {
      partner: this.toPartnerHeaderDto(partner, 'grocery', unitsCountRow?.count ?? 0, 'stores'),
      stats: {
        totalBookings: confirmed.length,
        totalCustomers: new Set(confirmed.map((r) => r.order.customerId)).size,
        totalRevenue: confirmed.reduce((sum, r) => sum + Number(r.order.grandTotal), 0),
      },
      bookings: rows.map((r) => ({
        id: r.order.id,
        bookingRef: r.order.orderRef,
        description: `${r.order.storeSnapshot.storeName} · ${r.order.fulfillment}`,
        customerName: r.customerName, customerMobile: r.customerMobile, customerEmail: r.customerEmail,
        amount: Number(r.order.grandTotal), status: r.order.status, bookedAt: r.order.placedAt.toISOString(),
      })),
    };
  }

  private toPartnerHeaderDto(
    partner: typeof users.$inferSelect,
    type: (typeof PARTNER_ROLES)[number],
    unitsCount: number,
    unitsLabel: string,
  ) {
    return {
      id: partner.id,
      type,
      typeLabel: PARTNER_TYPE_LABEL[type],
      name: partner.name,
      businessName: partner.businessName,
      businessAddress: partner.businessAddress,
      email: partner.email,
      mobile: partner.mobile,
      kycStatus: partner.kycStatus,
      createdAt: partner.createdAt.toISOString(),
      unitsCount,
      unitsLabel,
    };
  }
  /* ─────────────────────── Revenue (bus vs hotel, combined) ────────────
   * The "total earning of both businesses" view: independent 30-day,
   * zero-filled series per vertical (so a quiet day shows a true zero
   * rather than a gap) plus all-time totals for each.
   */
  /**
   * Registry-driven revenue: totals and a 30-day daily series for EVERY
   * registered service. A newly registered vertical appears on the Revenue
   * page automatically — the same promise as the Services page.
   */
  async revenueOverview() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const perService = await Promise.all(
      SERVICE_REGISTRY.map(async (svc) => {
        const [metrics, daily] = await Promise.all([svc.metrics(this.db, since), svc.daily(this.db)]);
        return { key: svc.key, label: svc.label, category: svc.category, ...metrics, daily };
      }),
    );

    // Fold per-service daily arrays into one row per day:
    // { date: '2026-07-01', bike: 1200, taxi: 3400, hotel: 9000, ... }
    const dayMap = new Map<string, Record<string, number | string>>();
    for (const svc of perService) {
      for (const point of svc.daily) {
        const row = dayMap.get(point.date) ?? { date: point.date };
        row[svc.key] = point.value;
        dayMap.set(point.date, row);
      }
    }

    return {
      windowDays: 30,
      services: perService.map(({ daily: _daily, ...rest }) => rest),
      combined: {
        value30d: perService.reduce((n, s) => n + s.value30d, 0),
        bookings30d: perService.reduce((n, s) => n + s.bookings30d, 0),
      },
      daily: [...dayMap.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    };
  }

  /* ─────────────────────── Platform settings ────────────────────────── */

  async getSettings() {
    const [row] = await this.db.select().from(platformSettings).where(eq(platformSettings.id, 'platform')).limit(1);
    if (row) return this.toSettingsDto(row);

    // Lazily create the singleton settings row on first read so a fresh
    // database never needs a manual seed step.
    const [created] = await this.db.insert(platformSettings).values({ id: 'platform' }).returning();
    return this.toSettingsDto(created);
  }

  async updateSettings(superAdminId: string, dto: UpdateSettingsDto) {
    await this.getSettings(); // ensures the singleton row exists

    const [updated] = await this.db
      .update(platformSettings)
      .set({
        ...(dto.platformName !== undefined ? { platformName: dto.platformName } : {}),
        ...(dto.supportEmail !== undefined ? { supportEmail: dto.supportEmail } : {}),
        ...(dto.supportPhone !== undefined ? { supportPhone: dto.supportPhone } : {}),
        ...(dto.serviceFeePercent !== undefined ? { serviceFeePercent: dto.serviceFeePercent.toFixed(2) } : {}),
        ...(dto.maintenanceMode !== undefined ? { maintenanceMode: dto.maintenanceMode } : {}),
        updatedBy: superAdminId,
        updatedAt: new Date(),
      })
      .where(eq(platformSettings.id, 'platform'))
      .returning();

    await this.audit(superAdminId, 'super_admin.settings.update', 'platform_settings', 'platform');

    return this.toSettingsDto(updated);
  }

  private toSettingsDto(row: typeof platformSettings.$inferSelect) {
    return {
      platformName: row.platformName,
      supportEmail: row.supportEmail,
      supportPhone: row.supportPhone,
      serviceFeePercent: Number(row.serviceFeePercent),
      maintenanceMode: row.maintenanceMode,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async decideKyc(superAdminId: string, userId: string, kycStatus: 'APPROVED' | 'SUSPENDED') {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) apiError(404, 'User not found.');

    await this.db.update(users).set({ kycStatus, updatedAt: new Date() }).where(eq(users.id, userId));

    // A partner only gets a wallet once approved (customers get theirs at
    // registration time — see AuthService.register).
    if (kycStatus === 'APPROVED') {
      await this.db
        .insert(wallets)
        .values({ userId, available: '0', escrow: '0' })
        .onConflictDoNothing();
    }

    await this.audit(superAdminId, `super_admin.kyc.${kycStatus.toLowerCase()}`, 'user', userId);

    return { ok: true };
  }

  /* ── CMS content ──────────────────────────────────────────────────────── */

  /**
   * Every customer-facing service the CMS can switch on/off. Unknown keys
   * in a PATCH are dropped (never stored) so a stale client can't grow the
   * flag set, and a missing key reads as enabled — a brand-new service is
   * live until an admin decides otherwise.
   */
  /**
   * Derived from the Service Registry — one source of truth. Registering a
   * new service automatically gives it a CMS availability flag, an overview
   * card, and a bookings drill-down with zero extra wiring.
   */
  static readonly CMS_SERVICES: readonly string[] = SERVICE_REGISTRY.map((s) => s.key);

  async getCms() {
    const [row] = await this.db.select().from(cmsContent).where(eq(cmsContent.id, 'cms')).limit(1);
    if (row) return this.toCmsDto(row);

    // Lazily create the singleton row on first read, same as getSettings().
    const [created] = await this.db
      .insert(cmsContent)
      .values({
        id: 'cms',
        banners: [],
        serviceFlags: Object.fromEntries(SuperAdminService.CMS_SERVICES.map((s) => [s, true])),
      })
      .returning();
    return this.toCmsDto(created);
  }

  async updateCms(superAdminId: string, dto: UpdateCmsDto) {
    const current = await this.getCms(); // ensures the singleton row exists

    const patch: Partial<typeof cmsContent.$inferInsert> = {};

    if (dto.banners !== undefined) {
      patch.banners = dto.banners.map((b) => ({
        id: b.id,
        title: b.title.trim(),
        message: b.message.trim(),
        active: b.active,
      }));
    }

    if (dto.serviceFlags !== undefined) {
      // Whitelist merge: only known service keys are ever persisted.
      const flags: Record<string, boolean> = { ...current.serviceFlags };
      for (const key of SuperAdminService.CMS_SERVICES) {
        const v = dto.serviceFlags[key];
        if (typeof v === 'boolean') flags[key] = v;
      }
      patch.serviceFlags = flags;
    }

    const [updated] = await this.db
      .update(cmsContent)
      .set({ ...patch, updatedBy: superAdminId, updatedAt: new Date() })
      .where(eq(cmsContent.id, 'cms'))
      .returning();

    await this.audit(superAdminId, 'super_admin.cms.update', 'cms_content', 'cms');
    return this.toCmsDto(updated);
  }

  /** Public view — what the customer app consumes: active banners only. */
  async getPublicCms() {
    const full = await this.getCms();
    return {
      banners: full.banners.filter((b) => b.active),
      serviceFlags: full.serviceFlags,
    };
  }

  private toCmsDto(row: typeof cmsContent.$inferSelect) {
    return {
      banners: row.banners,
      serviceFlags: Object.fromEntries(
        SuperAdminService.CMS_SERVICES.map((s) => [s, row.serviceFlags[s] ?? true]),
      ),
      services: [...SuperAdminService.CMS_SERVICES],
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /* ── Service directory (registry-driven) ─────────────────────────────── */

  /** Overview card for every registered service — metrics + CMS on/off state. */
  async listServices() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const cms = await this.getCms();
    const services = await Promise.all(
      SERVICE_REGISTRY.map(async (svc) => ({
        key: svc.key,
        label: svc.label,
        category: svc.category,
        enabled: cms.serviceFlags[svc.key] ?? true,
        ...(await svc.metrics(this.db, since)),
      })),
    );
    return { windowDays: 30, services };
  }

  /** Recent bookings for one service, with customer/provider names resolved. */
  async listServiceBookings(key: string, limit: number, offset: number) {
    const svc = SERVICE_REGISTRY.find((s) => s.key === key);
    if (!svc) apiError(404, 'Unknown service.');

    const rows = await svc.recent(this.db, limit, offset);

    // Resolve every referenced platform user (customers + user-providers
    // like drivers) in a single query — same pattern as fraudSignals().
    const ids = [
      ...new Set(
        rows
          .flatMap((r) => [r.customerId, r.providerUserId])
          .filter((v): v is string => Boolean(v)),
      ),
    ];
    const userRows = ids.length
      ? await this.db
          .select({ id: users.id, name: users.name, mobile: users.mobile })
          .from(users)
          .where(inArray(users.id, ids))
      : [];
    const byId = new Map(userRows.map((u) => [u.id, u]));

    return {
      service: { key: svc.key, label: svc.label, category: svc.category },
      rows: rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        amount: r.amount,
        createdAt: r.createdAt,
        customer: r.customerId ? (byId.get(r.customerId) ?? null) : null,
        provider: r.providerName ?? (r.providerUserId ? (byId.get(r.providerUserId)?.name ?? null) : null),
      })),
    };
  }

  /* ── Fraud signals ────────────────────────────────────────────────────── */

  /**
   * Rule-based fraud/abuse signals computed live from platform data. There
   * is deliberately no ML model here — every flag is an explainable SQL
   * rule an admin can verify by hand, which is what a review queue needs.
   * Thresholds are conservative starting points; tune them as real data
   * accumulates.
   */
  async fraudSignals() {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1) Customers cancelling half or more of their recent bookings.
    const cancelRows = await this.db
      .select({
        userId: rides.customerId,
        total: sql<number>`count(*)::int`,
        cancelled: sql<number>`(count(*) filter (where ${rides.status} = 'CANCELLED'))::int`,
      })
      .from(rides)
      .where(gte(rides.createdAt, monthAgo))
      .groupBy(rides.customerId)
      .having(
        sql`count(*) >= 3 and (count(*) filter (where ${rides.status} = 'CANCELLED')) * 2 >= count(*)`,
      );

    // 2) Booking velocity — unusually many bookings inside 24 hours.
    const rapidRows = await this.db
      .select({ userId: rides.customerId, count: sql<number>`count(*)::int` })
      .from(rides)
      .where(gte(rides.createdAt, dayAgo))
      .groupBy(rides.customerId)
      .having(sql`count(*) > 5`);

    // 3) Large wallet top-up volume inside 24 hours (money-in anomaly).
    const topupRows = await this.db
      .select({ userId: transactions.userId, amount: sql<number>`sum(${transactions.amount})::float` })
      .from(transactions)
      .where(
        and(
          eq(transactions.type, 'TOPUP'),
          eq(transactions.status, 'SUCCESS'),
          gte(transactions.createdAt, dayAgo),
        ),
      )
      .groupBy(transactions.userId)
      .having(sql`sum(${transactions.amount}) >= 20000`);

    // 4) Drivers settling ≥90% of trips in self-confirmed cash. Cash is
    //    confirmed by the driver alone, so a near-total cash share is worth
    //    a human look (fare skimming / off-platform settlement).
    const cashRows = await this.db
      .select({
        userId: rides.driverId,
        total: sql<number>`count(*)::int`,
        cash: sql<number>`(count(*) filter (where ${rides.paymentMethod} = 'cash'))::int`,
      })
      .from(rides)
      .where(
        and(eq(rides.status, 'COMPLETED'), gte(rides.createdAt, monthAgo), sql`${rides.driverId} is not null`),
      )
      .groupBy(rides.driverId)
      .having(
        sql`count(*) >= 5 and (count(*) filter (where ${rides.paymentMethod} = 'cash')) * 10 >= count(*) * 9`,
      );

    // Resolve every flagged account's name/mobile in one query.
    const ids = [
      ...new Set(
        [...cancelRows, ...rapidRows, ...topupRows, ...cashRows]
          .map((r) => r.userId)
          .filter((v): v is string => Boolean(v)),
      ),
    ];
    const userRows = ids.length
      ? await this.db
          .select({ id: users.id, name: users.name, mobile: users.mobile, role: users.role })
          .from(users)
          .where(inArray(users.id, ids))
      : [];
    const byId = new Map(userRows.map((u) => [u.id, u]));
    const who = (uid: string | null) => (uid ? (byId.get(uid) ?? null) : null);

    return {
      evaluatedAt: now.toISOString(),
      windows: { velocityHours: 24, behaviourDays: 30 },
      summary: {
        cancelHeavy: cancelRows.length,
        rapidBookers: rapidRows.length,
        bigTopups: topupRows.length,
        cashHeavyDrivers: cashRows.length,
      },
      cancelHeavy: cancelRows.map((r) => ({
        userId: r.userId,
        user: who(r.userId),
        total: r.total,
        cancelled: r.cancelled,
        ratio: r.total ? r.cancelled / r.total : 0,
      })),
      rapidBookers: rapidRows.map((r) => ({ userId: r.userId, user: who(r.userId), count: r.count })),
      bigTopups: topupRows.map((r) => ({ userId: r.userId, user: who(r.userId), amount: r.amount })),
      cashHeavyDrivers: cashRows.map((r) => ({
        userId: r.userId,
        user: who(r.userId),
        total: r.total,
        cash: r.cash,
        ratio: r.total ? r.cash / r.total : 0,
      })),
    };
  }

  private async audit(
    actorId: string,
    action: string,
    targetType: string | null,
    targetId: string | null,
  ) {
    await this.db.insert(auditLogs).values({
      id: id('audit'),
      actorId,
      actorType: 'super_admin',
      action,
      targetType,
      targetId,
    });
  }
}