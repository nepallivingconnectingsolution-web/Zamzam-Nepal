/**
 * Service Registry — the single source of truth for every vertical Zamzam
 * offers. The super-admin "Services" endpoints, the CMS availability flags,
 * and the frontend Services page are ALL driven by this list, so onboarding
 * a new vertical means adding ONE adapter entry here — nothing else.
 *
 * Each adapter answers two questions generically:
 *   metrics(db, since) — how is this service doing? (bookings, value, open now)
 *   recent(db, ...)    — show me its latest bookings, in a normalized shape.
 */
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Database } from '../../database/database.module';
import {
  foodOrders,
  groceryOrders,
  loads,
  rides,
  roomBookings,
  tickets,
} from '../../database/schema';

export interface ServiceMetrics {
  bookings30d: number;
  /** Gross booked value in the window (completed fares / non-cancelled totals). */
  value30d: number;
  /** Bookings currently in-flight (service-specific "open" statuses). */
  openNow: number;
}

/** One booking/order/ticket, normalized so a single UI can render any vertical. */
export interface ServiceBookingRow {
  id: string;
  title: string;
  customerId: string | null;
  /** Set when the provider is a platform user (e.g. a driver) — resolved to a name later. */
  providerUserId: string | null;
  /** Set when the provider name is already known (snapshots: hotel/restaurant/store/operator). */
  providerName: string | null;
  amount: number | null;
  status: string;
  createdAt: string;
}

export interface ServiceAdapter {
  key: string;
  label: string;
  category: 'Mobility' | 'Logistics' | 'Travel & stay' | 'Commerce';
  metrics(db: Database, since: Date): Promise<ServiceMetrics>;
  recent(db: Database, limit: number, offset: number): Promise<ServiceBookingRow[]>;
  /** 30-day daily revenue series — powers the Revenue page chart. */
  daily(db: Database): Promise<{ date: string; value: number }[]>;
}

/**
 * 30-day daily revenue series in one generate_series query. Table/column
 * names are raw snake_case because the calendar join can't use drizzle
 * column objects. The `where` clause defines what counts as revenue for
 * that vertical.
 */
async function dailySeries(
  db: Database,
  opts: { table: string; dateCol: string; amountCol: string; where: string },
): Promise<{ date: string; value: number }[]> {
  const result = await db.execute<{ date: string; total: string }>(sql`
    select to_char(d.day, 'YYYY-MM-DD') as date,
           coalesce(sum(x.${sql.raw(opts.amountCol)}), 0) as total
    from generate_series(current_date - interval '29 days', current_date, interval '1 day') as d(day)
    left join ${sql.raw(opts.table)} x
      on date_trunc('day', x.${sql.raw(opts.dateCol)}) = d.day
     and (${sql.raw(opts.where)})
    group by d.day
    order by d.day`);
  return result.rows.map((r) => ({ date: r.date, value: Number(r.total) }));
}

/* ── Ride-based verticals share one table, so one factory covers all three ── */

function rideVertical(key: 'bike' | 'taxi' | 'parcel', label: string): ServiceAdapter {
  return {
    key,
    label,
    category: key === 'parcel' ? 'Logistics' : 'Mobility',
    daily(db) {
      return dailySeries(db, {
        table: 'rides', dateCol: 'created_at', amountCol: 'fare',
        where: `x.service = '${key}' and x.status = 'COMPLETED'`,
      });
    },
    async metrics(db, since) {
      const [m] = await db
        .select({
          bookings30d: sql<number>`count(*)::int`,
          value30d: sql<number>`coalesce(sum(${rides.fare}) filter (where ${rides.status} = 'COMPLETED'), 0)::float`,
          openNow: sql<number>`(count(*) filter (where ${rides.status} in ('REQUESTED','ACCEPTED','ONGOING','PAYMENT_PENDING')))::int`,
        })
        .from(rides)
        .where(and(eq(rides.service, key), gte(rides.createdAt, since)));
      return m;
    },
    async recent(db, limit, offset) {
      const rows = await db
        .select()
        .from(rides)
        .where(eq(rides.service, key))
        .orderBy(desc(rides.createdAt))
        .limit(limit)
        .offset(offset);
      return rows.map((r) => ({
        id: r.id,
        title: `${r.fromLabel} → ${r.toLabel}`,
        customerId: r.customerId,
        providerUserId: r.driverId,
        providerName: null,
        amount: Number(r.fare),
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      }));
    },
  };
}

/* ── The registry itself ──────────────────────────────────────────────────── */

export const SERVICE_REGISTRY: ServiceAdapter[] = [
  rideVertical('bike', 'Bike rides'),
  rideVertical('taxi', 'Taxi'),
  rideVertical('parcel', 'Parcel delivery'),

  {
    key: 'freight',
    label: 'Freight',
    category: 'Logistics',
    daily(db) {
      return dailySeries(db, {
        table: 'loads', dateCol: 'created_at', amountCol: 'budget',
        where: `x.status = 'DELIVERED'`,
      });
    },
    async metrics(db, since) {
      const [m] = await db
        .select({
          bookings30d: sql<number>`count(*)::int`,
          value30d: sql<number>`coalesce(sum(${loads.budget}) filter (where ${loads.status} = 'DELIVERED'), 0)::float`,
          openNow: sql<number>`(count(*) filter (where ${loads.status} in ('OPEN','ASSIGNED','IN_TRANSIT')))::int`,
        })
        .from(loads)
        .where(gte(loads.createdAt, since));
      return m;
    },
    async recent(db, limit, offset) {
      const rows = await db.select().from(loads).orderBy(desc(loads.createdAt)).limit(limit).offset(offset);
      return rows.map((r) => ({
        id: r.id,
        title: `${r.fromLabel} → ${r.toLabel} · ${r.weightKg} kg`,
        customerId: r.customerId,
        providerUserId: null,
        providerName: null,
        amount: r.budget ? Number(r.budget) : null,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      }));
    },
  },

  {
    key: 'bus',
    label: 'Intercity buses',
    category: 'Travel & stay',
    daily(db) {
      return dailySeries(db, {
        table: 'tickets', dateCol: 'booked_at', amountCol: 'grand_total',
        where: `x.status <> 'CANCELLED'`,
      });
    },
    async metrics(db, since) {
      const [m] = await db
        .select({
          bookings30d: sql<number>`count(*)::int`,
          value30d: sql<number>`coalesce(sum(${tickets.grandTotal}) filter (where ${tickets.status} <> 'CANCELLED'), 0)::float`,
          openNow: sql<number>`(count(*) filter (where ${tickets.status} in ('PENDING','CONFIRMED')))::int`,
        })
        .from(tickets)
        .where(gte(tickets.bookedAt, since));
      return m;
    },
    async recent(db, limit, offset) {
      const rows = await db.select().from(tickets).orderBy(desc(tickets.bookedAt)).limit(limit).offset(offset);
      return rows.map((r) => ({
        id: r.id,
        title: `${r.busSnapshot.from} → ${r.busSnapshot.to} · ${r.bookingRef}`,
        customerId: r.customerId,
        providerUserId: null,
        providerName: r.busSnapshot.operator,
        amount: Number(r.grandTotal),
        status: r.status,
        createdAt: r.bookedAt.toISOString(),
      }));
    },
  },

  {
    key: 'hotel',
    label: 'Hotels',
    category: 'Travel & stay',
    // ▼ added
    daily(db) {
      return dailySeries(db, {
        table: 'room_bookings', dateCol: 'booked_at', amountCol: 'grand_total',
        where: `x.status <> 'CANCELLED'`,
      });
    },
    // ▲ added
    async metrics(db, since) {
      const [m] = await db
        .select({
          bookings30d: sql<number>`count(*)::int`,
          value30d: sql<number>`coalesce(sum(${roomBookings.grandTotal}) filter (where ${roomBookings.status} <> 'CANCELLED'), 0)::float`,
          openNow: sql<number>`(count(*) filter (where ${roomBookings.status} = 'CONFIRMED'))::int`,
        })
        .from(roomBookings)
        .where(gte(roomBookings.bookedAt, since));
      return m;
    },
    async recent(db, limit, offset) {
      const rows = await db.select().from(roomBookings).orderBy(desc(roomBookings.bookedAt)).limit(limit).offset(offset);
      return rows.map((r) => ({
        id: r.id,
        title: `${r.hotelSnapshot.roomTypeName} · ${r.checkIn} → ${r.checkOut} · ${r.bookingRef}`,
        customerId: r.customerId,
        providerUserId: null,
        providerName: r.hotelSnapshot.hotelName,
        amount: Number(r.grandTotal),
        status: r.status,
        createdAt: r.bookedAt.toISOString(),
      }));
    },
  },

  {
    key: 'food',
    label: 'Food delivery',
    category: 'Commerce',
    // ▼ added
    daily(db) {
      return dailySeries(db, {
        table: 'food_orders', dateCol: 'placed_at', amountCol: 'grand_total',
        where: `x.status <> 'CANCELLED'`,
      });
    },
    // ▲ added
    async metrics(db, since) {
      const [m] = await db
        .select({
          bookings30d: sql<number>`count(*)::int`,
          value30d: sql<number>`coalesce(sum(${foodOrders.grandTotal}) filter (where ${foodOrders.status} <> 'CANCELLED'), 0)::float`,
          openNow: sql<number>`(count(*) filter (where ${foodOrders.status} in ('PENDING','ACCEPTED','PREPARING','READY','OUT_FOR_DELIVERY')))::int`,
        })
        .from(foodOrders)
        .where(gte(foodOrders.placedAt, since));
      return m;
    },
    async recent(db, limit, offset) {
      const rows = await db.select().from(foodOrders).orderBy(desc(foodOrders.placedAt)).limit(limit).offset(offset);
      return rows.map((r) => ({
        id: r.id,
        title: `Order ${r.orderRef}`,
        customerId: r.customerId,
        providerUserId: null,
        providerName: r.restaurantSnapshot.restaurantName,
        amount: Number(r.grandTotal),
        status: r.status,
        createdAt: r.placedAt.toISOString(),
      }));
    },
  },

  {
    key: 'grocery',
    label: 'Groceries',
    category: 'Commerce',
    // ▼ added
    daily(db) {
      return dailySeries(db, {
        table: 'grocery_orders', dateCol: 'placed_at', amountCol: 'grand_total',
        where: `x.status <> 'CANCELLED'`,
      });
    },
    // ▲ added
    async metrics(db, since) {
      const [m] = await db
        .select({
          bookings30d: sql<number>`count(*)::int`,
          value30d: sql<number>`coalesce(sum(${groceryOrders.grandTotal}) filter (where ${groceryOrders.status} <> 'CANCELLED'), 0)::float`,
          openNow: sql<number>`(count(*) filter (where ${groceryOrders.status} in ('PENDING','CONFIRMED','PACKING','PACKED','OUT_FOR_DELIVERY')))::int`,
        })
        .from(groceryOrders)
        .where(gte(groceryOrders.placedAt, since));
      return m;
    },
    async recent(db, limit, offset) {
      const rows = await db.select().from(groceryOrders).orderBy(desc(groceryOrders.placedAt)).limit(limit).offset(offset);
      return rows.map((r) => ({
        id: r.id,
        title: `Order ${r.orderRef}`,
        customerId: r.customerId,
        providerUserId: null,
        providerName: r.storeSnapshot.storeName,
        amount: Number(r.grandTotal),
        status: r.status,
        createdAt: r.placedAt.toISOString(),
      }));
    },
  },
];