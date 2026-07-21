CREATE TABLE IF NOT EXISTS "bus_reviews" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"ticket_id" varchar(32) NOT NULL,
	"operator_id" varchar(32) NOT NULL,
	"customer_id" varchar(32) NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bus_reviews" ADD CONSTRAINT "bus_reviews_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bus_reviews" ADD CONSTRAINT "bus_reviews_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bus_reviews" ADD CONSTRAINT "bus_reviews_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bus_reviews_ticket_unique_idx" ON "bus_reviews" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bus_reviews_operator_idx" ON "bus_reviews" USING btree ("operator_id");