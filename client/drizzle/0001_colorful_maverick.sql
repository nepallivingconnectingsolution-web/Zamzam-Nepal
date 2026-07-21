CREATE TYPE "public"."room_booking_status" AS ENUM('CONFIRMED', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."txn_type" ADD VALUE 'HOTEL' BEFORE 'TOPUP';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hotels" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"partner_id" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"address" text NOT NULL,
	"description" text,
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "room_bookings" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"customer_id" varchar(32) NOT NULL,
	"hotel_id" varchar(32) NOT NULL,
	"room_type_id" varchar(32) NOT NULL,
	"booking_ref" varchar(16) NOT NULL,
	"status" "room_booking_status" DEFAULT 'CONFIRMED' NOT NULL,
	"check_in" varchar(10) NOT NULL,
	"check_out" varchar(10) NOT NULL,
	"nights" integer NOT NULL,
	"guests" integer NOT NULL,
	"guest_name" text NOT NULL,
	"guest_phone" text NOT NULL,
	"hotel_snapshot" jsonb NOT NULL,
	"price_per_night" numeric(10, 2) NOT NULL,
	"total_price" numeric(12, 2) NOT NULL,
	"service_fee" numeric(12, 2) NOT NULL,
	"grand_total" numeric(12, 2) NOT NULL,
	"method" varchar(32),
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "room_types" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"hotel_id" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_per_night" numeric(10, 2) NOT NULL,
	"total_rooms" integer NOT NULL,
	"max_guests" integer DEFAULT 2 NOT NULL,
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hotels" ADD CONSTRAINT "hotels_partner_id_users_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_types" ADD CONSTRAINT "room_types_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hotels_partner_idx" ON "hotels" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hotels_city_idx" ON "hotels" USING btree ("city");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_bookings_customer_idx" ON "room_bookings" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_bookings_hotel_idx" ON "room_bookings" USING btree ("hotel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_bookings_room_type_idx" ON "room_bookings" USING btree ("room_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "room_bookings_booking_ref_idx" ON "room_bookings" USING btree ("booking_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_bookings_availability_idx" ON "room_bookings" USING btree ("room_type_id","status","check_in","check_out");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_types_hotel_idx" ON "room_types" USING btree ("hotel_id");