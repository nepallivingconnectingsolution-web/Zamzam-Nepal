CREATE TABLE IF NOT EXISTS "ride_reviews" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"ride_id" varchar(32) NOT NULL,
	"driver_id" varchar(32) NOT NULL,
	"customer_id" varchar(32) NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ride_reviews" ADD CONSTRAINT "ride_reviews_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ride_reviews" ADD CONSTRAINT "ride_reviews_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ride_reviews" ADD CONSTRAINT "ride_reviews_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ride_reviews_ride_unique_idx" ON "ride_reviews" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ride_reviews_driver_idx" ON "ride_reviews" USING btree ("driver_id");