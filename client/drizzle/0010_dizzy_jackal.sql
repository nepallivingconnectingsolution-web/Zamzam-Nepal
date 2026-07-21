CREATE TYPE "public"."bid_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."load_status" AS ENUM('OPEN', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."vehicle_category" AS ENUM('bike', 'car', 'van', 'mini_truck', 'truck');--> statement-breakpoint
ALTER TYPE "public"."ride_status" ADD VALUE 'REQUESTED';--> statement-breakpoint
ALTER TYPE "public"."ride_status" ADD VALUE 'ACCEPTED';--> statement-breakpoint
ALTER TYPE "public"."txn_type" ADD VALUE 'PARCEL' BEFORE 'HOTEL';--> statement-breakpoint
ALTER TYPE "public"."txn_type" ADD VALUE 'FREIGHT' BEFORE 'HOTEL';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bids" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"load_id" varchar(32) NOT NULL,
	"transporter_id" varchar(32) NOT NULL,
	"vehicle_id" varchar(32),
	"amount" numeric(12, 2) NOT NULL,
	"message" text,
	"status" "bid_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loads" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"customer_id" varchar(32) NOT NULL,
	"from_label" text NOT NULL,
	"to_label" text NOT NULL,
	"pickup_lat" numeric(10, 7),
	"pickup_lng" numeric(10, 7),
	"drop_lat" numeric(10, 7),
	"drop_lng" numeric(10, 7),
	"cargo_description" text NOT NULL,
	"weight_kg" integer NOT NULL,
	"preferred_category" "vehicle_category",
	"budget" numeric(12, 2),
	"pickup_date" varchar(10),
	"status" "load_status" DEFAULT 'OPEN' NOT NULL,
	"accepted_bid_id" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vehicles" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"driver_id" varchar(32) NOT NULL,
	"category" "vehicle_category" NOT NULL,
	"make_model" text NOT NULL,
	"plate_number" varchar(24) NOT NULL,
	"color" varchar(24),
	"max_weight_kg" integer NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"photo_ref" text,
	"document_ref" text,
	"verification_status" "kyc_status" DEFAULT 'PENDING' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_status" ADD COLUMN "active_vehicle_id" varchar(32);--> statement-breakpoint
ALTER TABLE "driver_status" ADD COLUMN "lat" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "driver_status" ADD COLUMN "lng" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "driver_status" ADD COLUMN "last_location_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "vehicle_id" varchar(32);--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "pickup_lat" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "pickup_lng" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "drop_lat" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "drop_lng" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "distance_km" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "parcel_weight_kg" integer;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bids" ADD CONSTRAINT "bids_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bids" ADD CONSTRAINT "bids_transporter_id_users_id_fk" FOREIGN KEY ("transporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bids" ADD CONSTRAINT "bids_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loads" ADD CONSTRAINT "loads_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bids_load_idx" ON "bids" USING btree ("load_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bids_transporter_idx" ON "bids" USING btree ("transporter_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bids_load_transporter_unique_idx" ON "bids" USING btree ("load_id","transporter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loads_customer_idx" ON "loads" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loads_status_idx" ON "loads" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_driver_idx" ON "vehicles" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_verification_idx" ON "vehicles" USING btree ("verification_status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vehicles_plate_unique_idx" ON "vehicles" USING btree ("plate_number");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "driver_status" ADD CONSTRAINT "driver_status_active_vehicle_id_vehicles_id_fk" FOREIGN KEY ("active_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rides" ADD CONSTRAINT "rides_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "driver_status_online_idx" ON "driver_status" USING btree ("online");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rides_match_idx" ON "rides" USING btree ("status","service");