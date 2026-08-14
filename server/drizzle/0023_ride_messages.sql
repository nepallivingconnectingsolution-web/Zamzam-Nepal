CREATE TABLE IF NOT EXISTS "ride_messages" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"ride_id" varchar(32) NOT NULL,
	"sender_id" varchar(32) NOT NULL,
	"sender_role" varchar(16) NOT NULL,
	"body" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ride_messages" ADD CONSTRAINT "ride_messages_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ride_messages" ADD CONSTRAINT "ride_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ride_messages_ride_idx" ON "ride_messages" USING btree ("ride_id","created_at");