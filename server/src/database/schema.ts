/**
 * Drizzle ORM schema for the Zamzam platform.
 *
 * This schema is the single source of truth for every table in Postgres
 * (Neon). It is deliberately shaped to match the frontend's existing data
 * contract field-for-field (see client/src/services/db.types.ts, which
 * described the old in-browser mock — this schema is its real-database
 * successor).
 */
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  numeric,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/* ───────────────────────────── Enums ──────────────────────────────────── */

export const roleEnum = pgEnum('role', [
  'customer',
  'driver',
  'bus_operator',
  'freight',
  'hotel',
  'restaurant',
  'grocery',
  'admin',
]);

export type Role = (typeof roleEnum.enumValues)[number];

export const kycStatusEnum = pgEnum('kyc_status', ['PENDING', 'APPROVED', 'SUSPENDED']);

export const scheduleFrequencyEnum = pgEnum('schedule_frequency', ['once', 'daily', 'weekly']);

export const scheduleStatusEnum = pgEnum('schedule_status', ['active', 'cancelled', 'completed']);

export const tripStatusEnum = pgEnum('trip_status', ['scheduled', 'cancelled', 'completed']);

export const ticketStatusEnum = pgEnum('ticket_status', [
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
]);

export const txnStatusEnum = pgEnum('txn_status', ['SUCCESS', 'PENDING', 'FAILED']);

export const txnTypeEnum = pgEnum('txn_type', ['BUS', 'RIDE', 'PARCEL', 'FREIGHT', 'HOTEL', 'FOOD', 'GROCERY', 'TOPUP', 'PAYOUT', 'REFUND', 'ADJUSTMENT']);

/**
 * Ride lifecycle. REQUESTED and ACCEPTED are appended (not reordered) so the
 * migration is a safe `ALTER TYPE ... ADD VALUE` instead of a type rebuild.
 * Flow: REQUESTED → ACCEPTED → ONGOING → COMPLETED (or CANCELLED at any point).
 */
export const rideStatusEnum = pgEnum('ride_status', [
  'COMPLETED',
  'CANCELLED',
  'ONGOING',
  'REQUESTED',
  'ACCEPTED',
  // Appended (never reordered) so the migration stays a safe ADD VALUE.
  // PAYMENT_PENDING sits between "driver ended the trip" and "fare settled":
  // REQUESTED → ACCEPTED → ONGOING → PAYMENT_PENDING → COMPLETED.
  'PAYMENT_PENDING',
]);

/**
 * Vehicle categories for the on-demand fleet (taxi/bike/parcel) and freight.
 * Which services a category can serve is decided in code (see
 * modules/vehicles), not in the schema — a bike serves bike-rides and small
 * parcels; a car serves taxi and parcels; van/mini_truck/truck serve large
 * parcels and freight.
 */
export const vehicleCategoryEnum = pgEnum('vehicle_category', [
  'bike',
  'car',
  'van',
  'mini_truck',
  'truck',
]);

/** Freight post-and-bid lifecycle. */
export const loadStatusEnum = pgEnum('load_status', [
  'OPEN',
  'ASSIGNED',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
]);

export const bidStatusEnum = pgEnum('bid_status', [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
]);


export const disputeStatusEnum = pgEnum('dispute_status', ['OPEN', 'RESOLVED']);

export const roomBookingStatusEnum = pgEnum('room_booking_status', ['CONFIRMED', 'CANCELLED']);

export const foodOrderStatusEnum = pgEnum('food_order_status', [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
]);

export const fulfillmentTypeEnum = pgEnum('fulfillment_type', ['delivery', 'pickup']);

/**
 * Grocery's own status vocabulary — deliberately distinct from
 * foodOrderStatusEnum's ACCEPTED/PREPARING/READY. "Confirmed → Packing →
 * Packed" is what GroceryService, the grocery DTOs, and the partner/
 * customer UI all actually use, so the enum must match those names or
 * every status-setting call in GroceryService fails to typecheck.
 * Declared here (before any table uses it) — not at the bottom of the
 * file — since `const` isn't hoisted and every table below references it.
 */
export const groceryOrderStatusEnum = pgEnum('grocery_order_status', [
  'PENDING',
  'CONFIRMED',
  'PACKING',
  'PACKED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
]);

/* ───────────────────────────── Super admins ─────────────────────────────
 * Deliberately a separate table from `users`. The frontend treats super
 * admin as its own auth domain (separate login page, separate token store,
 * separate route guard) and never as a value of the customer-facing `role`
 * enum — this mirrors that exactly. Keeping platform-operator credentials
 * out of the same table/auth pipeline as customer accounts is also the
 * safer pattern for production: a bug or breach in customer auth can never
 * cascade into super-admin access.
 */
export const superAdmins = pgTable(
  'super_admins',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    name: text('name').notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    refreshTokenHash: text('refresh_token_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('super_admins_email_unique_idx').on(t.email),
  }),
);

/* ───────────────────────────── Users ──────────────────────────────────── */

export const users = pgTable(
  'users',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    name: text('name').notNull(),
    mobile: varchar('mobile', { length: 20 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: roleEnum('role').notNull(),
    kycStatus: kycStatusEnum('kyc_status').notNull().default('PENDING'),
    profileComplete: boolean('profile_complete').notNull().default(false),
    avatarUrl: text('avatar_url'),
    businessName: text('business_name'),
    businessAddress: text('business_address'),
    businessDocumentRef: text('business_document_ref'),
    refreshTokenHash: text('refresh_token_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_unique_idx').on(t.email),
    // Mobile is a primary registration identifier (blueprint §4.1.1) and must
    // be unique — otherwise two accounts can share one phone number.
    mobileIdx: uniqueIndex('users_mobile_unique_idx').on(t.mobile),
    roleIdx: index('users_role_idx').on(t.role),
    kycIdx: index('users_kyc_status_idx').on(t.kycStatus),
  }),
);

/* ───────────────────────────── Refresh tokens ────────────────────────────
 * One row per live session (browser/device). Replaces the old single
 * users.refreshTokenHash column, which enforced one-session-per-account and
 * silently logged out every other device ~15 minutes after any new login.
 * The JWT itself carries a `jti` matching this row's id; refresh looks the
 * row up by jti and compares a SHA-256 hash of the full token. SHA-256 (not
 * bcrypt) on purpose: bcrypt only reads the first 72 bytes, and JWTs for the
 * same user share their first 72 bytes, which would make revocation checks
 * unreliable. The token is a 200+ char signed secret, so a fast hash is the
 * correct primitive here (unlike passwords).
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: varchar('id', { length: 32 }).primaryKey(), // the JWT's jti claim
    userId: varchar('user_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(), // sha256 hex
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('refresh_tokens_user_idx').on(t.userId),
  }),
);

/* ───────────────────────────── Password reset tokens ─────────────────────
 * Backs the in-app forgot-password OTP flow (POST /auth/forgot-password →
 * /auth/verify-reset-otp → /auth/reset-password, and the mirrored
 * /super-admin/auth/* routes). One row per requested code.
 *
 * Exactly one of userId/superAdminId is set, matching the split between
 * `users` and `superAdmins` above — a real FK per identity table catches a
 * wiring bug that a single polymorphic (accountType, accountId) pair would
 * silently swallow. `email` is denormalized onto the row so lookups don't
 * need a join before the account is known to exist (and so the
 * forgot-password endpoint's generic response never has to branch on it).
 * `otpHash` is SHA-256 (not bcrypt) — same reasoning as refreshTokens.tokenHash:
 * this is a short-lived, single-use, server-generated value, not a
 * user-chosen password. `attempts` caps brute-forcing the 6-digit space
 * within the expiry window independently of the endpoint's rate limit.
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    userId: varchar('user_id', { length: 32 }).references(() => users.id, { onDelete: 'cascade' }),
    superAdminId: varchar('super_admin_id', { length: 32 }).references(() => superAdmins.id, {
      onDelete: 'cascade',
    }),
    email: varchar('email', { length: 255 }).notNull(),
    otpHash: varchar('otp_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    used: boolean('used').notNull().default(false),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index('password_reset_tokens_email_idx').on(t.email),
  }),
);

/* ───────────────────────────── Wallets ────────────────────────────────── */
export const wallets = pgTable('wallets', {
  userId: varchar('user_id', { length: 32 })
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  available: numeric('available', { precision: 14, scale: 2 }).notNull().default('0'),
  escrow: numeric('escrow', { precision: 14, scale: 2 }).notNull().default('0'),
  currency: varchar('currency', { length: 3 }).notNull().default('NPR'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});


/* ───────────────────────────── Transactions ───────────────────────────── */

export const transactions = pgTable(
  'transactions',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    userId: varchar('user_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: txnTypeEnum('type').notNull(),
    status: txnStatusEnum('status').notNull().default('SUCCESS'),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('NPR'),
    description: text('description').notNull(),
    inbound: boolean('inbound').notNull().default(false),
    referenceType: varchar('reference_type', { length: 32 }),
     referenceId: varchar('reference_id', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('transactions_user_idx').on(t.userId),
    referenceIdx: index('transactions_reference_idx').on(t.referenceType, t.referenceId),

  }),
);

/* ───────────────────────────── Buses (fleet) ──────────────────────────── */

export const buses = pgTable(
  'buses',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    operatorId: varchar('operator_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    busName: text('bus_name').notNull(),
    busNumber: text('bus_number').notNull(),
    registrationNo: text('registration_no').notNull(),
    type: text('type').notNull(),
    fuelType: text('fuel_type').notNull(),
    totalSeats: integer('total_seats').notNull(),
    totalRows: integer('total_rows').notNull(),
    amenities: jsonb('amenities').$type<string[]>().notNull().default([]),
    busPhoto: text('bus_photo'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    operatorIdx: index('buses_operator_idx').on(t.operatorId),
  }),
);

/* ───────────────────────────── Schedules (route templates) ────────────── */

export const schedules = pgTable(
  'schedules',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    operatorId: varchar('operator_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    busId: varchar('bus_id', { length: 32 })
      .notNull()
      .references(() => buses.id, { onDelete: 'cascade' }),
    fromCity: text('from_city').notNull(),
    toCity: text('to_city').notNull(),
    departure: varchar('departure', { length: 16 }).notNull(), // "07:00 AM"
    arrival: varchar('arrival', { length: 16 }).notNull(),
    duration: varchar('duration', { length: 16 }).notNull(), // "6h 30m"
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    status: scheduleStatusEnum('status').notNull().default('active'),
    frequency: scheduleFrequencyEnum('frequency').notNull(),
    operatingDays: jsonb('operating_days').$type<number[]>().notNull().default([]),
    onceDate: varchar('once_date', { length: 10 }), // "YYYY-MM-DD"
    validFrom: varchar('valid_from', { length: 10 }).notNull(),
    validUntil: varchar('valid_until', { length: 10 }),
    // Denormalised snapshot fields, copied from the bus at creation time so a
    // schedule keeps showing correct info even if the bus record changes later.
    busName: text('bus_name').notNull(),
    busType: text('bus_type').notNull(),
    totalSeats: integer('total_seats').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    operatorIdx: index('schedules_operator_idx').on(t.operatorId),
    busIdx: index('schedules_bus_idx').on(t.busId),
  }),
);

/* ───────────────────────────── Trips (dated departures) ───────────────── */

export const trips = pgTable(
  'trips',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    scheduleId: varchar('schedule_id', { length: 32 })
      .notNull()
      .references(() => schedules.id, { onDelete: 'cascade' }),
    operatorId: varchar('operator_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    busId: varchar('bus_id', { length: 32 })
      .notNull()
      .references(() => buses.id, { onDelete: 'cascade' }),
    fromCity: text('from_city').notNull(),
    toCity: text('to_city').notNull(),
    date: varchar('date', { length: 10 }).notNull(), // "YYYY-MM-DD"
    departure: varchar('departure', { length: 16 }).notNull(),
    arrival: varchar('arrival', { length: 16 }).notNull(),
    duration: varchar('duration', { length: 16 }).notNull(),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    status: tripStatusEnum('status').notNull().default('scheduled'),
    bookedSeats: jsonb('booked_seats').$type<string[]>().notNull().default([]),
    totalSeats: integer('total_seats').notNull(),
    totalRows: integer('total_rows').notNull(),
    type: text('type').notNull(),
    amenities: jsonb('amenities').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    scheduleIdx: index('trips_schedule_idx').on(t.scheduleId),
    operatorIdx: index('trips_operator_idx').on(t.operatorId),
    searchIdx: index('trips_search_idx').on(t.fromCity, t.toCity, t.date, t.status),
  }),
);

/* ───────────────────────────── Tickets (bus bookings) ──────────────────── */

export const tickets = pgTable(
  'tickets',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    customerId: varchar('customer_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    operatorId: varchar('operator_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tripId: varchar('trip_id', { length: 32 })
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    bookingRef: varchar('booking_ref', { length: 16 }).notNull(),
    status: ticketStatusEnum('status').notNull().default('CONFIRMED'),
    // Denormalised snapshot of the trip/bus at booking time, so a ticket still
    // displays correctly even if the underlying trip is later edited/cancelled.
    busSnapshot: jsonb('bus_snapshot')
      .$type<{
        operator: string;
        from: string;
        to: string;
        date: string;
        departure: string;
        arrival: string;
        type: string;
      }>()
      .notNull(),
    seats: jsonb('seats').$type<string[]>().notNull(),
    passengers: jsonb('passengers')
      .$type<
        {
          firstName: string;
          lastName: string;
          email: string;
          phone: string;
          age: number;
          gender: 'male' | 'female' | 'other';
        }[]
      >()
      .notNull(),
    totalPrice: numeric('total_price', { precision: 12, scale: 2 }).notNull(),
    serviceFee: numeric('service_fee', { precision: 12, scale: 2 }).notNull(),
    grandTotal: numeric('grand_total', { precision: 12, scale: 2 }).notNull(),
    method: varchar('method', { length: 32 }),
    bookedAt: timestamp('booked_at', { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
   cancellationReason: text('cancellation_reason'),

  },
  (t) => ({
    customerIdx: index('tickets_customer_idx').on(t.customerId),
    operatorIdx: index('tickets_operator_idx').on(t.operatorId),
    tripIdx: index('tickets_trip_idx').on(t.tripId),
    bookingRefIdx: uniqueIndex('tickets_booking_ref_idx').on(t.bookingRef),
  }),
);

/* ───────────────────────────── Bus reviews ───────────────────────────────
 * One review per ticket (enforced via unique index on ticket_id), same
 * philosophy as room_reviews: a passenger can only rate a journey they
 * actually booked, once, and only after it's actually happened.
 * operatorId is denormalised here (same pattern as roomReviews.hotelId) so
 * the operator-side reviews query doesn't need to join through trips just
 * to filter "reviews on my routes".
 */
export const busReviews = pgTable(
  'bus_reviews',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    ticketId: varchar('ticket_id', { length: 32 })
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    operatorId: varchar('operator_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    customerId: varchar('customer_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ticketIdx: uniqueIndex('bus_reviews_ticket_unique_idx').on(t.ticketId),
    operatorIdx: index('bus_reviews_operator_idx').on(t.operatorId),
  }),
);

/* ───────────────────────────── Rides (taxi/bike) ───────────────────────── */

export const rides = pgTable(
  'rides',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    customerId: varchar('customer_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
   driverId: varchar('driver_id', { length: 32 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    // The vehicle that served this ride/parcel, snapshotted at accept time.
    vehicleId: varchar('vehicle_id', { length: 32 }).references(() => vehicles.id, {
      onDelete: 'set null',
    }),
    service: varchar('service', { length: 32 }).notNull(),
    fromLabel: text('from_label').notNull(),
    toLabel: text('to_label').notNull(),
    // Coordinates are nullable so legacy rows (and manual bookings without a
    // map) stay valid. New bookings from ServiceBookingPage always set them.
    pickupLat: numeric('pickup_lat', { precision: 10, scale: 7 }),
    pickupLng: numeric('pickup_lng', { precision: 10, scale: 7 }),
    dropLat: numeric('drop_lat', { precision: 10, scale: 7 }),
    dropLng: numeric('drop_lng', { precision: 10, scale: 7 }),
    distanceKm: numeric('distance_km', { precision: 8, scale: 2 }),
    // Parcel-only: declared package weight, used for capacity matching.
    parcelWeightKg: integer('parcel_weight_kg'),
    fare: numeric('fare', { precision: 10, scale: 2 }).notNull(),
    // Default stays 'ONGOING' (unchanged from the original schema) purely so
    // the migration never has to reference a brand-new enum value in the same
    // transaction that creates it — Postgres forbids that. RidesService always
    // sets status explicitly ('REQUESTED') when creating a booking.
   status: rideStatusEnum('status').notNull().default('ONGOING'),
    // Post-trip settlement (Uber-style closure flow). How the fare was paid
    // ('cash' | 'wallet'), when the driver ended the trip, and when payment
    // actually settled. All nullable so every legacy COMPLETED row stays valid.
   paymentMethod: varchar('payment_method', { length: 16 }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    cancelledBy: varchar('cancelled_by', { length: 16 }),
    cancellationReason: text('cancellation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    customerIdx: index('rides_customer_idx').on(t.customerId),
    driverIdx: index('rides_driver_idx').on(t.driverId),
    // Matching query: "open REQUESTED rides for service X" — see RidesService.
    matchIdx: index('rides_match_idx').on(t.status, t.service),
  }),
);

/* ───────────────────────────── Ride reviews ─────────────────────────────
 * One review per ride (enforced via unique index on ride_id), same pattern
 * as room_reviews/food_reviews/grocery_reviews. driverId is denormalised
 * here (mirrors roomReviews.hotelId) so the driver-facing rating query
 * never has to join back through rides just to filter by driver — and it
 * stays valid even if the ride's driverId reference were ever cleared.
 */
export const rideReviewerRoleEnum = pgEnum('ride_reviewer_role', ['customer', 'driver']);

export const rideReviews = pgTable(
  'ride_reviews',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    rideId: varchar('ride_id', { length: 32 })
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    driverId: varchar('driver_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    customerId: varchar('customer_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reviewerRole: rideReviewerRoleEnum('reviewer_role').notNull().default('customer'),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    rideReviewerIdx: uniqueIndex('ride_reviews_ride_reviewer_unique_idx').on(t.rideId, t.reviewerRole),
    driverIdx: index('ride_reviews_driver_idx').on(t.driverId),
    customerIdx: index('ride_reviews_customer_idx').on(t.customerId),
  }),
);

export const rideMessages = pgTable(
  'ride_messages',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    rideId: varchar('ride_id', { length: 32 })
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    senderId: varchar('sender_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    senderRole: varchar('sender_role', { length: 16 }).notNull(),
    body: text('body').notNull(),
    read: boolean('read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    rideIdx: index('ride_messages_ride_idx').on(t.rideId, t.createdAt),
  }),
);

/* ───────────────────────────── Driver status ───────────────────────────── */
/* ───────────────────────────── Driver documents ──────────────────────────
 * Identity/compliance documents (citizenship, driving license, national ID)
 * a driver uploads for KYC. Verified by the super admin through the same
 * PENDING/APPROVED/SUSPENDED pattern as vehicles and partner accounts.
 * One row per (driver, type) — re-uploading a document replaces the file
 * and resets it to PENDING rather than growing an unbounded history.
 */
export const driverDocumentTypeEnum = pgEnum('driver_document_type', ['citizenship', 'license', 'nid']);

export const driverDocuments = pgTable(
  'driver_documents',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    driverId: varchar('driver_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: driverDocumentTypeEnum('type').notNull(),
    fileUrl: text('file_url').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    status: kycStatusEnum('status').notNull().default('PENDING'),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    driverIdx: index('driver_documents_driver_idx').on(t.driverId),
    statusIdx: index('driver_documents_status_idx').on(t.status),
    driverTypeIdx: uniqueIndex('driver_documents_driver_type_unique_idx').on(t.driverId, t.type),
  }),
);


/* ───────────────────────────── Vehicles ──────────────────────────────────
 * The registry behind taxi/bike/parcel matching and freight bidding. A
 * vehicle only enters the matching pool once verificationStatus is APPROVED
 * (super admin approves it through the same KYC pattern as partner
 * accounts), its owner is online, and it is the driver's active vehicle.
 */
export const vehicles = pgTable(
  'vehicles',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    driverId: varchar('driver_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: vehicleCategoryEnum('category').notNull(),
    makeModel: text('make_model').notNull(), // e.g. "Bajaj Pulsar 150", "Suzuki WagonR"
    plateNumber: varchar('plate_number', { length: 24 }).notNull(),
    color: varchar('color', { length: 24 }),
    // Carrying capacity, used by parcel/freight matching. Sensible defaults
    // are applied per category in VehiclesService if the driver leaves it out.
    maxWeightKg: integer('max_weight_kg').notNull(),
    seats: integer('seats').notNull().default(1), // passenger seats excl. driver
    photoRef: text('photo_ref'),
    documentRef: text('document_ref'), // bluebook / registration document
    verificationStatus: kycStatusEnum('verification_status').notNull().default('PENDING'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    driverIdx: index('vehicles_driver_idx').on(t.driverId),
    verificationIdx: index('vehicles_verification_idx').on(t.verificationStatus),
    plateIdx: uniqueIndex('vehicles_plate_unique_idx').on(t.plateNumber),
  }),
);

export const partnerDocumentPartnerTypeEnum = pgEnum('partner_document_partner_type', [
  'hotel',
  'restaurant',
  'grocery',
  'bus_operator',
  'freight',
]);

export const partnerDocuments = pgTable(
  'partner_documents',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    partnerId: varchar('partner_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    partnerType: partnerDocumentPartnerTypeEnum('partner_type').notNull(),
    type: varchar('type', { length: 40 }).notNull(),
    fileUrl: text('file_url').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    status: kycStatusEnum('status').notNull().default('PENDING'),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    partnerIdx: index('partner_documents_partner_idx').on(t.partnerId),
    statusIdx: index('partner_documents_status_idx').on(t.status),
    partnerTypeIdx: index('partner_documents_partner_type_idx').on(t.partnerType),
    partnerTypeUniqueIdx: uniqueIndex('partner_documents_partner_type_unique_idx').on(t.partnerId, t.type),
  }),
);

/* ───────────────────────────── Driver status ─────────────────────────────
 * Extended from the original single boolean: it now also answers "where is
 * this driver" (lat/lng, refreshed by POST /driver/location while online)
 * and "what are they driving" (activeVehicleId). Nearby matching filters on
 * online = true AND lastLocationAt within the freshness window.
 */

export const driverStatus = pgTable(
  'driver_status',
  {
    userId: varchar('user_id', { length: 32 })
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    online: boolean('online').notNull().default(false),
    activeVehicleId: varchar('active_vehicle_id', { length: 32 }).references(() => vehicles.id, {
      onDelete: 'set null',
    }),
    lat: numeric('lat', { precision: 10, scale: 7 }),
    lng: numeric('lng', { precision: 10, scale: 7 }),
    lastLocationAt: timestamp('last_location_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    onlineIdx: index('driver_status_online_idx').on(t.online),
  }),
);

/* ───────────────────────────── Freight loads ─────────────────────────────
 * Freight is post-and-bid, not live matching: a customer posts a load, any
 * verified freight transporter bids on it, the customer accepts one bid.
 */
export const loads = pgTable(
  'loads',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    customerId: varchar('customer_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fromLabel: text('from_label').notNull(),
    toLabel: text('to_label').notNull(),
    pickupLat: numeric('pickup_lat', { precision: 10, scale: 7 }),
    pickupLng: numeric('pickup_lng', { precision: 10, scale: 7 }),
    dropLat: numeric('drop_lat', { precision: 10, scale: 7 }),
    dropLng: numeric('drop_lng', { precision: 10, scale: 7 }),
    cargoDescription: text('cargo_description').notNull(),
    weightKg: integer('weight_kg').notNull(),
    preferredCategory: vehicleCategoryEnum('preferred_category'),
    budget: numeric('budget', { precision: 12, scale: 2 }),
    pickupDate: varchar('pickup_date', { length: 10 }), // "YYYY-MM-DD", same convention as buses
    status: loadStatusEnum('status').notNull().default('OPEN'),
    acceptedBidId: varchar('accepted_bid_id', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    customerIdx: index('loads_customer_idx').on(t.customerId),
    statusIdx: index('loads_status_idx').on(t.status),
  }),
);

/* ───────────────────────────── Freight bids ────────────────────────────── */

export const bids = pgTable(
  'bids',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    loadId: varchar('load_id', { length: 32 })
      .notNull()
      .references(() => loads.id, { onDelete: 'cascade' }),
    transporterId: varchar('transporter_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vehicleId: varchar('vehicle_id', { length: 32 }).references(() => vehicles.id, {
      onDelete: 'set null',
    }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    message: text('message'),
    status: bidStatusEnum('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    loadIdx: index('bids_load_idx').on(t.loadId),
    transporterIdx: index('bids_transporter_idx').on(t.transporterId),
    // One live bid per transporter per load — re-bidding means updating it.
    loadTransporterIdx: uniqueIndex('bids_load_transporter_unique_idx').on(
      t.loadId,
      t.transporterId,
    ),
  }),
);


/* ───────────────────────────── Ride reviews (taxi/bike/parcel) ──────────
 * One review per ride (unique index on ride_id), exactly mirroring
 * room_reviews / food_reviews / grocery_reviews. driverId is denormalised
 * so the driver-side "my reviews" query never has to join back through rides.
 */
// export const rideReviews = pgTable(
//   'ride_reviews',
//   {
//     id: varchar('id', { length: 32 }).primaryKey(),
//     rideId: varchar('ride_id', { length: 32 })
//       .notNull()
//       .references(() => rides.id, { onDelete: 'cascade' }),
//     driverId: varchar('driver_id', { length: 32 })
//       .notNull()
//       .references(() => users.id, { onDelete: 'cascade' }),
//     customerId: varchar('customer_id', { length: 32 })
//       .notNull()
//       .references(() => users.id, { onDelete: 'cascade' }),
//     rating: integer('rating').notNull(),
//     comment: text('comment'),
//     createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
//   },
//   (t) => ({
//     rideIdx: uniqueIndex('ride_reviews_ride_unique_idx').on(t.rideId),
//     driverIdx: index('ride_reviews_driver_idx').on(t.driverId),
//   }),
// );

/* ───────────────────────────── Freight load reviews ───────────────────── */
export const loadReviews = pgTable(
  'load_reviews',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    loadId: varchar('load_id', { length: 32 })
      .notNull()
      .references(() => loads.id, { onDelete: 'cascade' }),
    transporterId: varchar('transporter_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    customerId: varchar('customer_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    loadIdx: uniqueIndex('load_reviews_load_unique_idx').on(t.loadId),
    transporterIdx: index('load_reviews_transporter_idx').on(t.transporterId),
  }),
);

/* ───────────────────────────── Bus ticket reviews ──────────────────────── */
export const ticketReviews = pgTable(
  'ticket_reviews',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    ticketId: varchar('ticket_id', { length: 32 })
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    operatorId: varchar('operator_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    customerId: varchar('customer_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ticketIdx: uniqueIndex('ticket_reviews_ticket_unique_idx').on(t.ticketId),
    operatorIdx: index('ticket_reviews_operator_idx').on(t.operatorId),
  }),
);
/* ───────────────────────────── Hotels ──────────────────────────────────── */

export const hotels = pgTable(
  'hotels',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    partnerId: varchar('partner_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    city: text('city').notNull(),
    address: text('address').notNull(),
    description: text('description'),
    amenities: jsonb('amenities').$type<string[]>().notNull().default([]),
    photos: jsonb('photos').$type<string[]>().notNull().default([]),
    // Standard front-desk times shown to customers (e.g. "14:00" / "11:00").
    // Free-text "HH:MM" 24h — not tied to a specific booking, just the
    // hotel's general policy, same as any listing platform.
    checkInTime: varchar('check_in_time', { length: 5 }).notNull().default('12:00'),
    checkOutTime: varchar('check_out_time', { length: 5 }).notNull().default('11:00'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    partnerIdx: index('hotels_partner_idx').on(t.partnerId),
    cityIdx: index('hotels_city_idx').on(t.city),
  }),
);

/* ───────────────────────────── Room types ──────────────────────────────── */

export const roomTypes = pgTable(
  'room_types',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    hotelId: varchar('hotel_id', { length: 32 })
      .notNull()
      .references(() => hotels.id, { onDelete: 'cascade' }),
    name: text('name').notNull(), // e.g. "Deluxe Room", "Standard Twin"
    description: text('description'),
    pricePerNight: numeric('price_per_night', { precision: 10, scale: 2 }).notNull(),
    totalRooms: integer('total_rooms').notNull(),
    maxGuests: integer('max_guests').notNull().default(2),
    amenities: jsonb('amenities').$type<string[]>().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    hotelIdx: index('room_types_hotel_idx').on(t.hotelId),
  }),
);

/* ───────────────────────────── Room bookings ────────────────────────────
 * One row per booked date-range. Availability for a room type on a given
 * date is computed as: totalRooms - (count of CONFIRMED bookings whose
 * [checkIn, checkOut) range overlaps that date). This is the date-range
 * equivalent of the bus domain's bookedSeats array — instead of a fixed
 * set of seats on one trip, it's overlapping intervals against a fixed
 * room count. See HotelService.checkAvailability() for the overlap query.
 */
export const roomBookings = pgTable(
  'room_bookings',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    customerId: varchar('customer_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    hotelId: varchar('hotel_id', { length: 32 })
      .notNull()
      .references(() => hotels.id, { onDelete: 'cascade' }),
    roomTypeId: varchar('room_type_id', { length: 32 })
      .notNull()
      .references(() => roomTypes.id, { onDelete: 'cascade' }),
    bookingRef: varchar('booking_ref', { length: 16 }).notNull(),
    status: roomBookingStatusEnum('status').notNull().default('CONFIRMED'),
    checkIn: varchar('check_in', { length: 10 }).notNull(), // "YYYY-MM-DD", inclusive
    checkOut: varchar('check_out', { length: 10 }).notNull(), // "YYYY-MM-DD", exclusive (the night of checkOut is not booked)
    nights: integer('nights').notNull(),
    // How many rooms of this room type this single booking covers. Kept as
    // one booking row (not N rows) so it stays one bookingRef/one guest
    // record/one price line — availability math sums roomCount instead of
    // counting rows, see HotelService.overlappingBookedCount().
    roomCount: integer('room_count').notNull().default(1),
    guests: integer('guests').notNull(),
    guestName: text('guest_name').notNull(),
    guestPhone: text('guest_phone').notNull(),
    hotelSnapshot: jsonb('hotel_snapshot')
      .$type<{ hotelName: string; city: string; roomTypeName: string; pricePerNight: string }>()
      .notNull(),
    pricePerNight: numeric('price_per_night', { precision: 10, scale: 2 }).notNull(),
    totalPrice: numeric('total_price', { precision: 12, scale: 2 }).notNull(),
    serviceFee: numeric('service_fee', { precision: 12, scale: 2 }).notNull(),
    grandTotal: numeric('grand_total', { precision: 12, scale: 2 }).notNull(),
    method: varchar('method', { length: 32 }),
    bookedAt: timestamp('booked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    customerIdx: index('room_bookings_customer_idx').on(t.customerId),
    hotelIdx: index('room_bookings_hotel_idx').on(t.hotelId),
    roomTypeIdx: index('room_bookings_room_type_idx').on(t.roomTypeId),
    bookingRefIdx: uniqueIndex('room_bookings_booking_ref_idx').on(t.bookingRef),
    availabilityIdx: index('room_bookings_availability_idx').on(
      t.roomTypeId,
      t.status,
      t.checkIn,
      t.checkOut,
    ),
  }),
);

/* ───────────────────────────── Disputes ────────────────────────────────── */

export const disputes = pgTable('disputes', {
  id: varchar('id', { length: 32 }).primaryKey(),
  subject: text('subject').notNull(),
  status: disputeStatusEnum('status').notNull().default('OPEN'),
  amount: varchar('amount', { length: 32 }).notNull(),
  raisedByUserId: varchar('raised_by_user_id', { length: 32 }).references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────────────────────── Room reviews ─────────────────────────────
 * One review per booking (enforced via unique index on booking_id) so a
 * guest can only rate a stay they actually booked, and can't submit twice
 * for the same booking. hotelId is denormalised here (same pattern as
 * roomBookings.hotelSnapshot) purely so the partner-side reviews query
 * doesn't need to join through room_bookings just to filter by hotel.
 */
export const roomReviews = pgTable(
  'room_reviews',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    bookingId: varchar('booking_id', { length: 32 })
      .notNull()
      .references(() => roomBookings.id, { onDelete: 'cascade' }),
    hotelId: varchar('hotel_id', { length: 32 })
      .notNull()
      .references(() => hotels.id, { onDelete: 'cascade' }),
    customerId: varchar('customer_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bookingIdx: uniqueIndex('room_reviews_booking_unique_idx').on(t.bookingId),
    hotelIdx: index('room_reviews_hotel_idx').on(t.hotelId),
  }),
);

/* ───────────────────────────── Restaurants ──────────────────────────────
 * Same ownership model as hotels: one business-partner user (role
 * 'restaurant', approved by super admin through the existing KYC flow)
 * owns N restaurants. No new auth, no new approval tables.
 */
export const restaurants = pgTable(
  'restaurants',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    partnerId: varchar('partner_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    city: text('city').notNull(),
    address: text('address').notNull(),
    description: text('description'),
    cuisine: text('cuisine').notNull().default('Nepali'),
    photos: jsonb('photos').$type<string[]>().notNull().default([]),
    // "HH:MM" 24h, same free-text convention as hotels.checkInTime.
    openTime: varchar('open_time', { length: 5 }).notNull().default('09:00'),
    closeTime: varchar('close_time', { length: 5 }).notNull().default('21:00'),
    deliveryFee: numeric('delivery_fee', { precision: 10, scale: 2 }).notNull().default('0'),
    minOrder: numeric('min_order', { precision: 10, scale: 2 }).notNull().default('0'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    partnerIdx: index('restaurants_partner_idx').on(t.partnerId),
    cityIdx: index('restaurants_city_idx').on(t.city),
  }),
);

/* ───────────────────────────── Menu categories ─────────────────────────── */

export const menuCategories = pgTable(
  'menu_categories',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    restaurantId: varchar('restaurant_id', { length: 32 })
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(), // e.g. "Momo", "Drinks", "Dessert"
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    restaurantIdx: index('menu_categories_restaurant_idx').on(t.restaurantId),
  }),
);

/* ───────────────────────────── Menu items ──────────────────────────────── */

export const menuItems = pgTable(
  'menu_items',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    restaurantId: varchar('restaurant_id', { length: 32 })
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    // Nullable on purpose: deleting a category shouldn't delete its dishes,
    // they just fall back to the generic "Menu" group in the detail view.
    categoryId: varchar('category_id', { length: 32 }).references(() => menuCategories.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    description: text('description'),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    isVeg: boolean('is_veg').notNull().default(false),
    spiceLevel: integer('spice_level').notNull().default(0), // 0 none … 3 hot
    prepTimeMin: integer('prep_time_min').notNull().default(20),
    photo: text('photo'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    isAvailable: boolean('is_available').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    restaurantIdx: index('menu_items_restaurant_idx').on(t.restaurantId),
    categoryIdx: index('menu_items_category_idx').on(t.categoryId),
  }),
);

/* ───────────────────────────── Food orders ──────────────────────────────
 * One row per checkout. Line items live in food_order_items with a full
 * price/name snapshot (same philosophy as tickets.busSnapshot /
 * roomBookings.hotelSnapshot) so an order still renders correctly after
 * the menu changes. Money is captured at order time; cancellation refunds
 * to the customer wallet exactly like hotel bookings.
 */
export const foodOrders = pgTable(
  'food_orders',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    orderRef: varchar('order_ref', { length: 16 }).notNull(),
    customerId: varchar('customer_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    restaurantId: varchar('restaurant_id', { length: 32 })
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    status: foodOrderStatusEnum('status').notNull().default('PENDING'),
    fulfillment: fulfillmentTypeEnum('fulfillment').notNull(),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    deliveryAddress: text('delivery_address'),
    note: text('note'),
    restaurantSnapshot: jsonb('restaurant_snapshot')
      .$type<{ restaurantName: string; city: string }>()
      .notNull(),
    itemsTotal: numeric('items_total', { precision: 12, scale: 2 }).notNull(),
    deliveryFee: numeric('delivery_fee', { precision: 10, scale: 2 }).notNull().default('0'),
    serviceFee: numeric('service_fee', { precision: 12, scale: 2 }).notNull(),
    grandTotal: numeric('grand_total', { precision: 12, scale: 2 }).notNull(),
    method: varchar('method', { length: 32 }),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    customerIdx: index('food_orders_customer_idx').on(t.customerId),
    restaurantIdx: index('food_orders_restaurant_idx').on(t.restaurantId),
    statusIdx: index('food_orders_status_idx').on(t.restaurantId, t.status),
    orderRefIdx: uniqueIndex('food_orders_order_ref_idx').on(t.orderRef),
  }),
);

/* ───────────────────────────── Food order items ─────────────────────────── */

export const foodOrderItems = pgTable(
  'food_order_items',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    orderId: varchar('order_id', { length: 32 })
      .notNull()
      .references(() => foodOrders.id, { onDelete: 'cascade' }),
    menuItemId: varchar('menu_item_id', { length: 32 }).references(() => menuItems.id, {
      onDelete: 'set null',
    }),
    // Snapshot fields — never re-read from menu_items when displaying.
    name: text('name').notNull(),
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
    quantity: integer('quantity').notNull(),
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
    isVeg: boolean('is_veg').notNull().default(false),
  },
  (t) => ({
    orderIdx: index('food_order_items_order_idx').on(t.orderId),
  }),
);

/* ───────────────────────────── Food reviews ─────────────────────────────
 * One review per delivered order (unique index on order_id), mirroring
 * room_reviews' one-review-per-booking rule.
 */
export const foodReviews = pgTable(
  'food_reviews',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    orderId: varchar('order_id', { length: 32 })
      .notNull()
      .references(() => foodOrders.id, { onDelete: 'cascade' }),
    restaurantId: varchar('restaurant_id', { length: 32 })
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    customerId: varchar('customer_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: uniqueIndex('food_reviews_order_unique_idx').on(t.orderId),
    restaurantIdx: index('food_reviews_restaurant_idx').on(t.restaurantId),
  }),
);

/* ───────────────────────────── Grocery stores ───────────────────────────
 * Same ownership model as restaurants/hotels: one business-partner user
 * (role 'grocery', approved by super admin through the existing KYC flow)
 * owns N stores. No new auth, no new approval tables — this rides the
 * exact same pipeline as every other partner vertical.
 */
export const groceryStores = pgTable(
  'grocery_stores',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    partnerId: varchar('partner_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    city: text('city').notNull(),
    address: text('address').notNull(),
    description: text('description'),
    // Free-text so partners can self-describe ("Supermarket", "Kirana
    // Store", "Pharmacy", "Dark store") without us maintaining a taxonomy.
    storeType: text('store_type').notNull().default('Supermarket'),
    photos: jsonb('photos').$type<string[]>().notNull().default([]),
    openTime: varchar('open_time', { length: 5 }).notNull().default('07:00'),
    closeTime: varchar('close_time', { length: 5 }).notNull().default('22:00'),
    deliveryFee: numeric('delivery_fee', { precision: 10, scale: 2 }).notNull().default('0'),
    minOrder: numeric('min_order', { precision: 10, scale: 2 }).notNull().default('0'),
    // Cart value above which delivery becomes free — the classic
    // quick-commerce lever. Null = never waived.
    freeDeliveryAbove: numeric('free_delivery_above', { precision: 10, scale: 2 }),
    // The delivery-time promise shown to customers (Blinkit's "10 min").
    deliveryEtaMinutes: integer('delivery_eta_minutes').notNull().default(30),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    partnerIdx: index('grocery_stores_partner_idx').on(t.partnerId),
    cityIdx: index('grocery_stores_city_idx').on(t.city),
  }),
);

/* ───────────────────────────── Product categories (aisles) ─────────────── */

export const productCategories = pgTable(
  'product_categories',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    storeId: varchar('store_id', { length: 32 })
      .notNull()
      .references(() => groceryStores.id, { onDelete: 'cascade' }),
    name: text('name').notNull(), // e.g. "Fruits & Vegetables", "Dairy", "Snacks"
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    storeIdx: index('product_categories_store_idx').on(t.storeId),
  }),
);

/* ───────────────────────────── Products ──────────────────────────────────
 * `stock` is the one thing this domain has that food/hotel don't: a real,
 * decrementing inventory count. placeOrder() decrements it atomically per
 * line (see GroceryService.placeOrder) so two concurrent checkouts can
 * never both buy the last unit — same conditional-UPDATE pattern as
 * wallet.util's debitWalletOrFail.
 */
export const products = pgTable(
  'products',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    storeId: varchar('store_id', { length: 32 })
      .notNull()
      .references(() => groceryStores.id, { onDelete: 'cascade' }),
    // Nullable on purpose, same reasoning as menuItems.categoryId: deleting
    // an aisle shouldn't delete its products.
    categoryId: varchar('category_id', { length: 32 }).references(() => productCategories.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    description: text('description'),
    // Free-text pack size, e.g. "500 g", "1 L", "6 pcs", "1 dozen".
    unit: varchar('unit', { length: 24 }).notNull().default('1 pc'),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    // Optional strike-through "MRP" shown next to the selling price.
    mrp: numeric('mrp', { precision: 10, scale: 2 }),
    stock: integer('stock').notNull().default(0),
    photo: text('photo'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]), // e.g. "organic", "imported"
    // Manual visibility toggle, independent of stock — a product can be
    // hidden even with stock on hand (e.g. temporarily discontinued).
    isAvailable: boolean('is_available').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    storeIdx: index('products_store_idx').on(t.storeId),
    categoryIdx: index('products_category_idx').on(t.categoryId),
  }),
);

/* ───────────────────────────── Grocery orders ────────────────────────────
 * Same snapshot philosophy as foodOrders: line items freeze name/unit/
 * price at order time so an order still renders correctly after the
 * catalog changes later.
 */
export const groceryOrders = pgTable(
  'grocery_orders',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    orderRef: varchar('order_ref', { length: 16 }).notNull(),
    customerId: varchar('customer_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storeId: varchar('store_id', { length: 32 })
      .notNull()
      .references(() => groceryStores.id, { onDelete: 'cascade' }),
    status: groceryOrderStatusEnum('status').notNull().default('PENDING'),
    fulfillment: fulfillmentTypeEnum('fulfillment').notNull(),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    deliveryAddress: text('delivery_address'),
    note: text('note'),
    storeSnapshot: jsonb('store_snapshot')
      .$type<{ storeName: string; city: string }>()
      .notNull(),
    itemsTotal: numeric('items_total', { precision: 12, scale: 2 }).notNull(),
    deliveryFee: numeric('delivery_fee', { precision: 10, scale: 2 }).notNull().default('0'),
    serviceFee: numeric('service_fee', { precision: 12, scale: 2 }).notNull(),
    grandTotal: numeric('grand_total', { precision: 12, scale: 2 }).notNull(),
    method: varchar('method', { length: 32 }),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    customerIdx: index('grocery_orders_customer_idx').on(t.customerId),
    storeIdx: index('grocery_orders_store_idx').on(t.storeId),
    statusIdx: index('grocery_orders_status_idx').on(t.storeId, t.status),
    orderRefIdx: uniqueIndex('grocery_orders_order_ref_idx').on(t.orderRef),
  }),
);

export const groceryOrderItems = pgTable(
  'grocery_order_items',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    orderId: varchar('order_id', { length: 32 })
      .notNull()
      .references(() => groceryOrders.id, { onDelete: 'cascade' }),
    productId: varchar('product_id', { length: 32 }).references(() => products.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    unit: varchar('unit', { length: 24 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
    quantity: integer('quantity').notNull(),
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
  },
  (t) => ({
    orderIdx: index('grocery_order_items_order_idx').on(t.orderId),
  }),
);

/* ───────────────────────────── Grocery reviews ──────────────────────────── */

export const groceryReviews = pgTable(
  'grocery_reviews',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    orderId: varchar('order_id', { length: 32 })
      .notNull()
      .references(() => groceryOrders.id, { onDelete: 'cascade' }),
    storeId: varchar('store_id', { length: 32 })
      .notNull()
      .references(() => groceryStores.id, { onDelete: 'cascade' }),
    customerId: varchar('customer_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: uniqueIndex('grocery_reviews_order_unique_idx').on(t.orderId),
    storeIdx: index('grocery_reviews_store_idx').on(t.storeId),
  }),
);
/**
 * Drives the super-admin notification bell. `partner_registration` fires
 * when a new partner account signs up (AuthService.register);
 * `business_created` fires when an already-approved partner adds a new
 * business listing (a restaurant, grocery store, hotel, or bus).
 */
export const notificationTypeEnum = pgEnum('notification_type', [
  'partner_registration',
  'business_created',
  'dispute_filed',
  'refund_pending',
  'system',
]);


/* ───────────────────────────── Audit log ───────────────────────────────── */
/** Every privileged super-admin action (KYC decisions, etc.) is recorded here. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    actorId: varchar('actor_id', { length: 64 }).notNull(), // "sa_root" or a user id
    actorType: varchar('actor_type', { length: 16 }).notNull(), // "super_admin" | "user"
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actorIdx: index('audit_logs_actor_idx').on(t.actorId),
    targetIdx: index('audit_logs_target_idx').on(t.targetType, t.targetId),
  }),
);

/* ───────────────────────────── Platform settings ────────────────────────
 * Single-row (id = 'platform') key/value-ish config table backing the
 * super admin "Settings" screen. Kept as one row rather than a generic
 * key/value table since the set of platform-wide knobs is small and known
 * up front; getSettings() lazily creates this row on first read so a fresh
 * database never needs a manual seed step.
 */
export const platformSettings = pgTable('platform_settings', {
  id: varchar('id', { length: 32 }).primaryKey().default('platform'),
  platformName: text('platform_name').notNull().default('Zamzam Super App'),
  supportEmail: varchar('support_email', { length: 255 }).notNull().default('support@zamzam.com.np'),
  supportPhone: varchar('support_phone', { length: 20 }).notNull().default('+977-1-4000000'),
  serviceFeePercent: numeric('service_fee_percent', { precision: 5, scale: 2 }).notNull().default('2.00'),
  maintenanceMode: boolean('maintenance_mode').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 32 }),
});

/* ───────────────────────────── CMS content ──────────────────────────────
 * Single-row (id = 'cms') content table backing the super admin "CMS"
 * screen — the storefront content non-developers edit without a deploy:
 * promotional banners shown to customers, and per-service availability
 * flags. Same lazy-singleton pattern as platformSettings above; the row is
 * created on first read so a fresh database never needs a seed step.
 */
export interface CmsBanner {
  id: string;
  title: string;
  message: string;
  active: boolean;
}

export const cmsContent = pgTable('cms_content', {
  id: varchar('id', { length: 32 }).primaryKey().default('cms'),
  banners: jsonb('banners').$type<CmsBanner[]>().notNull(),
  serviceFlags: jsonb('service_flags').$type<Record<string, boolean>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 32 }),
});



/* ───────────────────────────── Super-admin notifications ──────────────── */
export const superAdminNotifications = pgTable(
  'super_admin_notifications',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdAtIdx: index('super_admin_notifications_created_at_idx').on(t.createdAt),
    isReadIdx: index('super_admin_notifications_is_read_idx').on(t.isRead),
  }),
);

/* ───────────────────────────── User notifications ───────────────────────
 * The customer/driver/partner-facing counterpart to super_admin_notifications
 * above — same shape, but scoped to a single user_id instead of being a
 * global platform feed. Powers the notification bell in the portal topbar
 * (PortalLayout) shared by every non-super-admin role.
 */
export const userNotificationTypeEnum = pgEnum('user_notification_type', [
  'booking_confirmed',
  'booking_cancelled',
  'refund_processed',
  'refund_failed',
  'order_update',
  'ride_update',
  'system',
]);

export const userNotifications = pgTable(
  'user_notifications',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    userId: varchar('user_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: userNotificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index('user_notifications_user_created_idx').on(t.userId, t.createdAt),
    userUnreadIdx: index('user_notifications_user_unread_idx').on(t.userId, t.isRead),
  }),
);

/* ───────────────────────────── Relations ───────────────────────────────── */

export const usersRelations = relations(users, ({ one, many }) => ({
  wallet: one(wallets, { fields: [users.id], references: [wallets.userId] }),
  transactions: many(transactions),
  buses: many(buses),
  schedules: many(schedules),
  tickets: many(tickets, { relationName: 'customerTickets' }),
  driverStatus: one(driverStatus, { fields: [users.id], references: [driverStatus.userId] }),
 vehicles: many(vehicles),
  driverDocuments: many(driverDocuments),
  partnerDocuments: many(partnerDocuments),
}));

export const vehiclesRelations = relations(vehicles, ({ one }) => ({
  driver: one(users, { fields: [vehicles.driverId], references: [users.id] }),
}));

export const driverDocumentsRelations = relations(driverDocuments, ({ one }) => ({
  driver: one(users, { fields: [driverDocuments.driverId], references: [users.id] }),
}));

export const partnerDocumentsRelations = relations(partnerDocuments, ({ one }) => ({
  partner: one(users, { fields: [partnerDocuments.partnerId], references: [users.id] }),
}));

export const driverStatusRelations = relations(driverStatus, ({ one }) => ({
  user: one(users, { fields: [driverStatus.userId], references: [users.id] }),
  activeVehicle: one(vehicles, {
    fields: [driverStatus.activeVehicleId],
    references: [vehicles.id],
  }),
}));

export const loadsRelations = relations(loads, ({ one, many }) => ({
  customer: one(users, { fields: [loads.customerId], references: [users.id] }),
  bids: many(bids),
}));

export const bidsRelations = relations(bids, ({ one }) => ({
  load: one(loads, { fields: [bids.loadId], references: [loads.id] }),
  transporter: one(users, { fields: [bids.transporterId], references: [users.id] }),
  vehicle: one(vehicles, { fields: [bids.vehicleId], references: [vehicles.id] }),
}));


export const busesRelations = relations(buses, ({ one, many }) => ({
  operator: one(users, { fields: [buses.operatorId], references: [users.id] }),
  schedules: many(schedules),
}));

export const schedulesRelations = relations(schedules, ({ one, many }) => ({
  bus: one(buses, { fields: [schedules.busId], references: [buses.id] }),
  operator: one(users, { fields: [schedules.operatorId], references: [users.id] }),
  trips: many(trips),
}));

export const tripsRelations = relations(trips, ({ one, many }) => ({
  schedule: one(schedules, { fields: [trips.scheduleId], references: [schedules.id] }),
  bus: one(buses, { fields: [trips.busId], references: [buses.id] }),
  tickets: many(tickets),
}));

export const ticketsRelations = relations(tickets, ({ one }) => ({
  customer: one(users, { fields: [tickets.customerId], references: [users.id] }),
  operator: one(users, { fields: [tickets.operatorId], references: [users.id] }),
  trip: one(trips, { fields: [tickets.tripId], references: [trips.id] }),
}));

export const busReviewsRelations = relations(busReviews, ({ one }) => ({
  ticket: one(tickets, { fields: [busReviews.ticketId], references: [tickets.id] }),
  operator: one(users, { fields: [busReviews.operatorId], references: [users.id] }),
  customer: one(users, { fields: [busReviews.customerId], references: [users.id] }),
}));

export const rideReviewsRelations = relations(rideReviews, ({ one }) => ({
  ride: one(rides, { fields: [rideReviews.rideId], references: [rides.id] }),
  driver: one(users, { fields: [rideReviews.driverId], references: [users.id] }),
  customer: one(users, { fields: [rideReviews.customerId], references: [users.id] }),
}));

export const rideMessagesRelations = relations(rideMessages, ({ one }) => ({
  ride: one(rides, { fields: [rideMessages.rideId], references: [rides.id] }),
  sender: one(users, { fields: [rideMessages.senderId], references: [users.id] }),
}));

export const loadReviewsRelations = relations(loadReviews, ({ one }) => ({
  load: one(loads, { fields: [loadReviews.loadId], references: [loads.id] }),
  transporter: one(users, { fields: [loadReviews.transporterId], references: [users.id] }),
  customer: one(users, { fields: [loadReviews.customerId], references: [users.id] }),
}));

export const ticketReviewsRelations = relations(ticketReviews, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketReviews.ticketId], references: [tickets.id] }),
  operator: one(users, { fields: [ticketReviews.operatorId], references: [users.id] }),
  customer: one(users, { fields: [ticketReviews.customerId], references: [users.id] }),
}));

export const hotelsRelations = relations(hotels, ({ one, many }) => ({
  partner: one(users, { fields: [hotels.partnerId], references: [users.id] }),
  roomTypes: many(roomTypes),
}));

export const roomTypesRelations = relations(roomTypes, ({ one, many }) => ({
  hotel: one(hotels, { fields: [roomTypes.hotelId], references: [hotels.id] }),
  bookings: many(roomBookings),
}));

export const roomBookingsRelations = relations(roomBookings, ({ one }) => ({
  customer: one(users, { fields: [roomBookings.customerId], references: [users.id] }),
  hotel: one(hotels, { fields: [roomBookings.hotelId], references: [hotels.id] }),
  roomType: one(roomTypes, { fields: [roomBookings.roomTypeId], references: [roomTypes.id] }),
}));

export const roomReviewsRelations = relations(roomReviews, ({ one }) => ({
  booking: one(roomBookings, { fields: [roomReviews.bookingId], references: [roomBookings.id] }),
  hotel: one(hotels, { fields: [roomReviews.hotelId], references: [hotels.id] }),
  customer: one(users, { fields: [roomReviews.customerId], references: [users.id] }),
}));

// export const rideReviewsRelations = relations(rideReviews, ({ one }) => ({
//   ride: one(rides, { fields: [rideReviews.rideId], references: [rides.id] }),
//   driver: one(users, { fields: [rideReviews.driverId], references: [users.id] }),
//   customer: one(users, { fields: [rideReviews.customerId], references: [users.id] }),
// }));

export const restaurantsRelations = relations(restaurants, ({ one, many }) => ({
  partner: one(users, { fields: [restaurants.partnerId], references: [users.id] }),
  categories: many(menuCategories),
  menuItems: many(menuItems),
  orders: many(foodOrders),
}));

export const menuCategoriesRelations = relations(menuCategories, ({ one, many }) => ({
  restaurant: one(restaurants, { fields: [menuCategories.restaurantId], references: [restaurants.id] }),
  items: many(menuItems),
}));

export const menuItemsRelations = relations(menuItems, ({ one }) => ({
  restaurant: one(restaurants, { fields: [menuItems.restaurantId], references: [restaurants.id] }),
  category: one(menuCategories, { fields: [menuItems.categoryId], references: [menuCategories.id] }),
}));

export const foodOrdersRelations = relations(foodOrders, ({ one, many }) => ({
  customer: one(users, { fields: [foodOrders.customerId], references: [users.id] }),
  restaurant: one(restaurants, { fields: [foodOrders.restaurantId], references: [restaurants.id] }),
  items: many(foodOrderItems),
}));

export const foodOrderItemsRelations = relations(foodOrderItems, ({ one }) => ({
  order: one(foodOrders, { fields: [foodOrderItems.orderId], references: [foodOrders.id] }),
  menuItem: one(menuItems, { fields: [foodOrderItems.menuItemId], references: [menuItems.id] }),
}));

export const foodReviewsRelations = relations(foodReviews, ({ one }) => ({
  order: one(foodOrders, { fields: [foodReviews.orderId], references: [foodOrders.id] }),
  restaurant: one(restaurants, { fields: [foodReviews.restaurantId], references: [restaurants.id] }),
  customer: one(users, { fields: [foodReviews.customerId], references: [users.id] }),
}));

export const groceryStoresRelations = relations(groceryStores, ({ one, many }) => ({
  partner: one(users, { fields: [groceryStores.partnerId], references: [users.id] }),
  categories: many(productCategories),
  products: many(products),
  orders: many(groceryOrders),
}));

export const productCategoriesRelations = relations(productCategories, ({ one, many }) => ({
  store: one(groceryStores, { fields: [productCategories.storeId], references: [groceryStores.id] }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one }) => ({
  store: one(groceryStores, { fields: [products.storeId], references: [groceryStores.id] }),
  category: one(productCategories, { fields: [products.categoryId], references: [productCategories.id] }),
}));

export const groceryOrdersRelations = relations(groceryOrders, ({ one, many }) => ({
  customer: one(users, { fields: [groceryOrders.customerId], references: [users.id] }),
  store: one(groceryStores, { fields: [groceryOrders.storeId], references: [groceryStores.id] }),
  items: many(groceryOrderItems),
}));

export const groceryOrderItemsRelations = relations(groceryOrderItems, ({ one }) => ({
  order: one(groceryOrders, { fields: [groceryOrderItems.orderId], references: [groceryOrders.id] }),
  product: one(products, { fields: [groceryOrderItems.productId], references: [products.id] }),
}));

export const groceryReviewsRelations = relations(groceryReviews, ({ one }) => ({
  order: one(groceryOrders, { fields: [groceryReviews.orderId], references: [groceryOrders.id] }),
  store: one(groceryStores, { fields: [groceryReviews.storeId], references: [groceryStores.id] }),
  customer: one(users, { fields: [groceryReviews.customerId], references: [users.id] }),
}));