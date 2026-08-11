CREATE TYPE "public"."partner_document_partner_type" AS ENUM('hotel', 'restaurant', 'grocery', 'bus_operator', 'freight');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partner_documents" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"partner_id" varchar(32) NOT NULL,
	"partner_type" "partner_document_partner_type" NOT NULL,
	"type" varchar(40) NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"status" "kyc_status" DEFAULT 'PENDING' NOT NULL,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "ride_messages" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "ride_messages" CASCADE;--> statement-breakpoint
DROP INDEX IF EXISTS "ride_reviews_ride_reviewer_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ride_reviews_customer_idx";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "partner_documents" ADD CONSTRAINT "partner_documents_partner_id_users_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "partner_documents_partner_idx" ON "partner_documents" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "partner_documents_status_idx" ON "partner_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "partner_documents_partner_type_idx" ON "partner_documents" USING btree ("partner_type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "partner_documents_partner_type_unique_idx" ON "partner_documents" USING btree ("partner_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ride_reviews_ride_unique_idx" ON "ride_reviews" USING btree ("ride_id");--> statement-breakpoint
ALTER TABLE "ride_reviews" DROP COLUMN IF EXISTS "reviewer_role";--> statement-breakpoint
ALTER TABLE "rides" DROP COLUMN IF EXISTS "cancelled_by";--> statement-breakpoint
ALTER TABLE "rides" DROP COLUMN IF EXISTS "cancellation_reason";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."ride_message_sender";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."ride_reviewer_role";