CREATE TYPE "public"."dispute_status" AS ENUM('OPEN', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('PENDING', 'APPROVED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."ride_status" AS ENUM('COMPLETED', 'CANCELLED', 'ONGOING');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('customer', 'driver', 'bus_operator', 'freight', 'hotel', 'admin');--> statement-breakpoint
CREATE TYPE "public"."schedule_frequency" AS ENUM('once', 'daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."schedule_status" AS ENUM('active', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('scheduled', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."txn_status" AS ENUM('SUCCESS', 'PENDING', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."txn_type" AS ENUM('BUS', 'RIDE', 'TOPUP', 'PAYOUT', 'REFUND', 'ADJUSTMENT');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"actor_id" varchar(64) NOT NULL,
	"actor_type" varchar(16) NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "buses" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"operator_id" varchar(32) NOT NULL,
	"bus_name" text NOT NULL,
	"bus_number" text NOT NULL,
	"registration_no" text NOT NULL,
	"type" text NOT NULL,
	"fuel_type" text NOT NULL,
	"total_seats" integer NOT NULL,
	"total_rows" integer NOT NULL,
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bus_photo" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "disputes" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"status" "dispute_status" DEFAULT 'OPEN' NOT NULL,
	"amount" varchar(32) NOT NULL,
	"raised_by_user_id" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "driver_status" (
	"user_id" varchar(32) PRIMARY KEY NOT NULL,
	"online" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rides" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"customer_id" varchar(32) NOT NULL,
	"driver_id" varchar(32),
	"service" varchar(32) NOT NULL,
	"from_label" text NOT NULL,
	"to_label" text NOT NULL,
	"fare" numeric(10, 2) NOT NULL,
	"status" "ride_status" DEFAULT 'ONGOING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schedules" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"operator_id" varchar(32) NOT NULL,
	"bus_id" varchar(32) NOT NULL,
	"from_city" text NOT NULL,
	"to_city" text NOT NULL,
	"departure" varchar(16) NOT NULL,
	"arrival" varchar(16) NOT NULL,
	"duration" varchar(16) NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"status" "schedule_status" DEFAULT 'active' NOT NULL,
	"frequency" "schedule_frequency" NOT NULL,
	"operating_days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"once_date" varchar(10),
	"valid_from" varchar(10) NOT NULL,
	"valid_until" varchar(10),
	"bus_name" text NOT NULL,
	"bus_type" text NOT NULL,
	"total_seats" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "super_admins" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"refresh_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tickets" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"customer_id" varchar(32) NOT NULL,
	"operator_id" varchar(32) NOT NULL,
	"trip_id" varchar(32) NOT NULL,
	"booking_ref" varchar(16) NOT NULL,
	"status" "ticket_status" DEFAULT 'CONFIRMED' NOT NULL,
	"bus_snapshot" jsonb NOT NULL,
	"seats" jsonb NOT NULL,
	"passengers" jsonb NOT NULL,
	"total_price" numeric(12, 2) NOT NULL,
	"service_fee" numeric(12, 2) NOT NULL,
	"grand_total" numeric(12, 2) NOT NULL,
	"method" varchar(32),
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"type" "txn_type" NOT NULL,
	"status" "txn_status" DEFAULT 'SUCCESS' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'NPR' NOT NULL,
	"description" text NOT NULL,
	"inbound" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trips" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"schedule_id" varchar(32) NOT NULL,
	"operator_id" varchar(32) NOT NULL,
	"bus_id" varchar(32) NOT NULL,
	"from_city" text NOT NULL,
	"to_city" text NOT NULL,
	"date" varchar(10) NOT NULL,
	"departure" varchar(16) NOT NULL,
	"arrival" varchar(16) NOT NULL,
	"duration" varchar(16) NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"status" "trip_status" DEFAULT 'scheduled' NOT NULL,
	"booked_seats" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_seats" integer NOT NULL,
	"total_rows" integer NOT NULL,
	"type" text NOT NULL,
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mobile" varchar(20) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"kyc_status" "kyc_status" DEFAULT 'PENDING' NOT NULL,
	"profile_complete" boolean DEFAULT false NOT NULL,
	"avatar_url" text,
	"business_name" text,
	"business_address" text,
	"business_document_ref" text,
	"refresh_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallets" (
	"user_id" varchar(32) PRIMARY KEY NOT NULL,
	"available" numeric(14, 2) DEFAULT '0' NOT NULL,
	"escrow" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(3) DEFAULT 'NPR' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "buses" ADD CONSTRAINT "buses_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raised_by_user_id_users_id_fk" FOREIGN KEY ("raised_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "driver_status" ADD CONSTRAINT "driver_status_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rides" ADD CONSTRAINT "rides_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schedules" ADD CONSTRAINT "schedules_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schedules" ADD CONSTRAINT "schedules_bus_id_buses_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."buses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trips" ADD CONSTRAINT "trips_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trips" ADD CONSTRAINT "trips_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trips" ADD CONSTRAINT "trips_bus_id_buses_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."buses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "buses_operator_idx" ON "buses" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rides_customer_idx" ON "rides" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rides_driver_idx" ON "rides" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schedules_operator_idx" ON "schedules" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schedules_bus_idx" ON "schedules" USING btree ("bus_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "super_admins_email_unique_idx" ON "super_admins" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_customer_idx" ON "tickets" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_operator_idx" ON "tickets" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_trip_idx" ON "tickets" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tickets_booking_ref_idx" ON "tickets" USING btree ("booking_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_idx" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trips_schedule_idx" ON "trips" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trips_operator_idx" ON "trips" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trips_search_idx" ON "trips" USING btree ("from_city","to_city","date","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_kyc_status_idx" ON "users" USING btree ("kyc_status");