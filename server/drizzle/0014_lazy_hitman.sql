CREATE TABLE IF NOT EXISTS "load_reviews" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"load_id" varchar(32) NOT NULL,
	"transporter_id" varchar(32) NOT NULL,
	"customer_id" varchar(32) NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_reviews" (
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
 ALTER TABLE "load_reviews" ADD CONSTRAINT "load_reviews_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "load_reviews" ADD CONSTRAINT "load_reviews_transporter_id_users_id_fk" FOREIGN KEY ("transporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "load_reviews" ADD CONSTRAINT "load_reviews_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_reviews" ADD CONSTRAINT "ticket_reviews_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_reviews" ADD CONSTRAINT "ticket_reviews_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_reviews" ADD CONSTRAINT "ticket_reviews_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "load_reviews_load_unique_idx" ON "load_reviews" USING btree ("load_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "load_reviews_transporter_idx" ON "load_reviews" USING btree ("transporter_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_reviews_ticket_unique_idx" ON "ticket_reviews" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_reviews_operator_idx" ON "ticket_reviews" USING btree ("operator_id");