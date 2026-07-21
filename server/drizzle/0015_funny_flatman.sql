CREATE TYPE "public"."driver_document_type" AS ENUM('citizenship', 'license', 'nid');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "driver_documents" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"driver_id" varchar(32) NOT NULL,
	"type" "driver_document_type" NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"status" "kyc_status" DEFAULT 'PENDING' NOT NULL,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "driver_documents_driver_idx" ON "driver_documents" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "driver_documents_status_idx" ON "driver_documents" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "driver_documents_driver_type_unique_idx" ON "driver_documents" USING btree ("driver_id","type");