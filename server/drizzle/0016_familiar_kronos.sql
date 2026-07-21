ALTER TYPE "public"."ride_status" ADD VALUE 'PAYMENT_PENDING';--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "payment_method" varchar(16);--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "paid_at" timestamp with time zone;