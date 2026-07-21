ALTER TYPE "public"."notification_type" ADD VALUE 'refund_pending' BEFORE 'system';--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "reference_type" varchar(32);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "reference_id" varchar(32);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_reference_idx" ON "transactions" USING btree ("reference_type","reference_id");