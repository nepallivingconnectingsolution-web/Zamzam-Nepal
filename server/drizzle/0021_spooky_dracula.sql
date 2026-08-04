CREATE TYPE "public"."ride_reviewer_role" AS ENUM('customer', 'driver');--> statement-breakpoint
DROP INDEX IF EXISTS "ride_reviews_ride_unique_idx";--> statement-breakpoint
ALTER TABLE "ride_reviews" ADD COLUMN "reviewer_role" "ride_reviewer_role" DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "cancelled_by" varchar(16);--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ride_reviews_ride_reviewer_unique_idx" ON "ride_reviews" USING btree ("ride_id","reviewer_role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ride_reviews_customer_idx" ON "ride_reviews" USING btree ("customer_id");