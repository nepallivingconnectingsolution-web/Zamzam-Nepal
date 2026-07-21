CREATE TABLE IF NOT EXISTS "room_reviews" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"booking_id" varchar(32) NOT NULL,
	"hotel_id" varchar(32) NOT NULL,
	"customer_id" varchar(32) NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_reviews" ADD CONSTRAINT "room_reviews_booking_id_room_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."room_bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_reviews" ADD CONSTRAINT "room_reviews_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "room_reviews" ADD CONSTRAINT "room_reviews_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "room_reviews_booking_unique_idx" ON "room_reviews" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_reviews_hotel_idx" ON "room_reviews" USING btree ("hotel_id");