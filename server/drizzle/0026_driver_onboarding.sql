-- Driver onboarding, verification and dispatch.
-- Hand-written like 0022-0025 (drizzle snapshots stopped at 0021). Every
-- statement is idempotent so a partially-applied run can be retried.

DO $$ BEGIN
 CREATE TYPE "public"."application_status" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RESUBMISSION_REQUIRED', 'APPROVED', 'REJECTED', 'SUSPENDED', 'EXPIRED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."review_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'RESUBMISSION_REQUIRED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."offer_status" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."doc_subject" AS ENUM('DRIVER', 'VEHICLE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "public"."user_notification_type" ADD VALUE IF NOT EXISTS 'driver_application';
--> statement-breakpoint
ALTER TYPE "public"."user_notification_type" ADD VALUE IF NOT EXISTS 'ride_offer';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "stored_files" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"owner_user_id" varchar(32) NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stored_files_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stored_files_owner_idx" ON "stored_files" USING btree ("owner_user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "driver_profiles" (
	"user_id" varchar(32) PRIMARY KEY NOT NULL,
	"legal_name" text,
	"photo_file_id" varchar(32),
	"date_of_birth" date,
	"gender" varchar(16),
	"address" text,
	"city" varchar(80),
	"province" varchar(40),
	"emergency_contact_name" text,
	"emergency_contact_phone" varchar(20),
	"language" varchar(8),
	"licence_number" varchar(40),
	"licence_class" varchar(16),
	"licence_authority" text,
	"licence_issue_date" date,
	"licence_expiry_date" date,
	"phone_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "driver_profiles_photo_file_id_stored_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."stored_files"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint

-- Vehicles: normalized plate + onboarding fields. plate_normalized is added
-- nullable, backfilled, then made NOT NULL so existing rows migrate cleanly.
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "plate_normalized" varchar(24);
--> statement-breakpoint
UPDATE "vehicles" SET "plate_normalized" = regexp_replace(upper("plate_number"), '[^A-Z0-9]', '', 'g') WHERE "plate_normalized" IS NULL;
--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "plate_normalized" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "make" varchar(40);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "model" varchar(40);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "manufacture_year" integer;
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "registration_year" integer;
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "fuel_type" varchar(16);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "service_class" varchar(24);
--> statement-breakpoint
DROP INDEX IF EXISTS "vehicles_plate_unique_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vehicles_plate_normalized_active_unique_idx" ON "vehicles" USING btree ("plate_normalized") WHERE "is_active" = true;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "driver_applications" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"status" "application_status" DEFAULT 'DRAFT' NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"vehicle_id" varchar(32),
	"is_legacy" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" varchar(64),
	"rejection_reason" text,
	"suspension_reason" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "driver_applications_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "driver_applications_user_unique_idx" ON "driver_applications" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "driver_applications_status_idx" ON "driver_applications" USING btree ("status","updated_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "application_documents" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"application_id" varchar(32) NOT NULL,
	"subject" "doc_subject" NOT NULL,
	"scope" varchar(32) NOT NULL,
	"vehicle_id" varchar(32),
	"doc_type" varchar(40) NOT NULL,
	"file_id" varchar(32) NOT NULL,
	"expiry_date" date,
	"status" "review_status" DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" text,
	"reviewed_by" varchar(64),
	"reviewed_at" timestamp with time zone,
	"superseded_by_id" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_documents_application_id_driver_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."driver_applications"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "application_documents_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "application_documents_file_id_stored_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_files"("id") ON DELETE restrict ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "application_documents_current_unique_idx" ON "application_documents" USING btree ("application_id","scope","doc_type") WHERE "superseded_by_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_documents_status_idx" ON "application_documents" USING btree ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "document_requirements" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"vehicle_type" varchar(16) DEFAULT '' NOT NULL,
	"service_class" varchar(24) DEFAULT '' NOT NULL,
	"subject" "doc_subject" NOT NULL,
	"doc_type" varchar(40) NOT NULL,
	"kind" varchar(8) DEFAULT 'DOCUMENT' NOT NULL,
	"label" text NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"requires_expiry" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_requirements_unique_idx" ON "document_requirements" USING btree ("vehicle_type","service_class","subject","doc_type");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "verification_reviews" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"application_id" varchar(32) NOT NULL,
	"target_type" varchar(16) NOT NULL,
	"target_id" varchar(32),
	"action" varchar(40) NOT NULL,
	"from_status" varchar(32),
	"to_status" varchar(32),
	"reason" text,
	"admin_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_reviews_application_id_driver_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."driver_applications"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_reviews_app_idx" ON "verification_reviews" USING btree ("application_id","created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ride_offers" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"ride_id" varchar(32) NOT NULL,
	"driver_id" varchar(32) NOT NULL,
	"status" "offer_status" DEFAULT 'PENDING' NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"pickup_distance_m" integer NOT NULL,
	"eta_min" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ride_offers_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "ride_offers_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ride_offers_ride_driver_unique_idx" ON "ride_offers" USING btree ("ride_id","driver_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ride_offers_driver_status_idx" ON "ride_offers" USING btree ("driver_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ride_offers_status_expiry_idx" ON "ride_offers" USING btree ("status","expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "phone_otps" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phone_otps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "phone_otps_user_created_idx" ON "phone_otps" USING btree ("user_id","created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "driver_location_log" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"driver_id" varchar(32) NOT NULL,
	"ride_id" varchar(32),
	"event" varchar(24) NOT NULL,
	"lat" numeric(10, 7) NOT NULL,
	"lng" numeric(10, 7) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_location_log_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "driver_location_log_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "driver_location_log_driver_idx" ON "driver_location_log" USING btree ("driver_id","created_at");
--> statement-breakpoint

-- A driver holds at most one active ride, enforced by the database. Uses NOT IN
-- over the two ORIGINAL ride_status values: values appended later cannot be
-- referenced in the transaction that added them, and a fresh database migrates
-- in a single transaction. REQUESTED rows never have a driver; NULLs don't
-- collide in a unique index. Fails loudly if two active rides already share a
-- driver: resolve those rows manually before migrating.
CREATE UNIQUE INDEX IF NOT EXISTS "rides_one_active_per_driver_idx" ON "rides" USING btree ("driver_id") WHERE "status" NOT IN ('COMPLETED', 'CANCELLED');
--> statement-breakpoint

-- Requirement configuration (not mock data): what each vehicle type must upload.
INSERT INTO "document_requirements" ("id","vehicle_type","service_class","subject","doc_type","kind","label","is_required","requires_expiry","sort_order") VALUES
 ('req_lic_front','','','DRIVER','licence_front','DOCUMENT','driving licence (front)',true,false,1),
 ('req_lic_back','','','DRIVER','licence_back','DOCUMENT','driving licence (back)',true,false,2),
 ('req_id_front','','','DRIVER','identity_front','DOCUMENT','citizenship or national ID (front)',true,false,3),
 ('req_id_back','','','DRIVER','identity_back','DOCUMENT','citizenship or national ID (back)',false,false,4),
 ('req_bike_bluebook','bike','','VEHICLE','bluebook','DOCUMENT','vehicle registration (bluebook)',true,false,1),
 ('req_bike_insurance','bike','','VEHICLE','insurance','DOCUMENT','vehicle insurance',true,true,2),
 ('req_bike_p_front','bike','','VEHICLE','photo:front','PHOTO','front photo',true,false,10),
 ('req_bike_p_side','bike','','VEHICLE','photo:side','PHOTO','side photo',true,false,11),
 ('req_bike_p_rear','bike','','VEHICLE','photo:rear','PHOTO','rear photo',true,false,12),
 ('req_bike_p_plate','bike','','VEHICLE','photo:plate','PHOTO','number plate photo',true,false,13),
 ('req_car_bluebook','car','','VEHICLE','bluebook','DOCUMENT','vehicle registration (bluebook)',true,false,1),
 ('req_car_insurance','car','','VEHICLE','insurance','DOCUMENT','vehicle insurance',true,true,2),
 ('req_car_roadtax','car','','VEHICLE','road_tax','DOCUMENT','road tax receipt',true,true,3),
 ('req_car_p_front','car','','VEHICLE','photo:front','PHOTO','front photo',true,false,10),
 ('req_car_p_rear','car','','VEHICLE','photo:rear','PHOTO','rear photo',true,false,11),
 ('req_car_p_left','car','','VEHICLE','photo:left','PHOTO','left side photo',true,false,12),
 ('req_car_p_right','car','','VEHICLE','photo:right','PHOTO','right side photo',true,false,13),
 ('req_car_p_interior','car','','VEHICLE','photo:interior','PHOTO','interior photo',true,false,14),
 ('req_car_p_plate','car','','VEHICLE','photo:plate','PHOTO','number plate photo',true,false,15)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Grandfather drivers an admin already approved, so the new eligibility check
-- does not lock out live drivers on deploy. Their document checks are skipped
-- (is_legacy) until they resubmit.
INSERT INTO "driver_applications" ("id","user_id","status","current_step","vehicle_id","is_legacy","reviewed_at")
SELECT 'app_legacy_' || substr(u."id", 3), u."id", 'APPROVED', 8,
       (SELECT ds."active_vehicle_id" FROM "driver_status" ds WHERE ds."user_id" = u."id"),
       true, now()
FROM "users" u
WHERE u."role" = 'driver' AND u."kyc_status" = 'APPROVED'
ON CONFLICT DO NOTHING;
