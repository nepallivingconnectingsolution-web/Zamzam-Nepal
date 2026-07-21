CREATE TYPE "public"."notification_type" AS ENUM('partner_registration', 'business_created', 'dispute_filed', 'system');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "super_admin_notifications" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "super_admin_notifications_created_at_idx" ON "super_admin_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "super_admin_notifications_is_read_idx" ON "super_admin_notifications" USING btree ("is_read");