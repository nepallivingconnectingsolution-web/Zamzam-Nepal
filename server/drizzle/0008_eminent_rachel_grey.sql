CREATE TYPE "public"."grocery_order_status" AS ENUM('PENDING', 'CONFIRMED', 'PACKING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'grocery' BEFORE 'admin';--> statement-breakpoint
ALTER TYPE "public"."txn_type" ADD VALUE 'GROCERY' BEFORE 'TOPUP';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grocery_order_items" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"order_id" varchar(32) NOT NULL,
	"product_id" varchar(32),
	"name" text NOT NULL,
	"unit" varchar(24) NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"line_total" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grocery_orders" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"order_ref" varchar(16) NOT NULL,
	"customer_id" varchar(32) NOT NULL,
	"store_id" varchar(32) NOT NULL,
	"status" "grocery_order_status" DEFAULT 'PENDING' NOT NULL,
	"fulfillment" "fulfillment_type" NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"delivery_address" text,
	"note" text,
	"store_snapshot" jsonb NOT NULL,
	"items_total" numeric(12, 2) NOT NULL,
	"delivery_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"service_fee" numeric(12, 2) NOT NULL,
	"grand_total" numeric(12, 2) NOT NULL,
	"method" varchar(32),
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grocery_reviews" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"order_id" varchar(32) NOT NULL,
	"store_id" varchar(32) NOT NULL,
	"customer_id" varchar(32) NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grocery_stores" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"partner_id" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"address" text NOT NULL,
	"description" text,
	"store_type" text DEFAULT 'Supermarket' NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open_time" varchar(5) DEFAULT '07:00' NOT NULL,
	"close_time" varchar(5) DEFAULT '22:00' NOT NULL,
	"delivery_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"min_order" numeric(10, 2) DEFAULT '0' NOT NULL,
	"free_delivery_above" numeric(10, 2),
	"delivery_eta_minutes" integer DEFAULT 30 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_categories" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"store_id" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"store_id" varchar(32) NOT NULL,
	"category_id" varchar(32),
	"name" text NOT NULL,
	"description" text,
	"unit" varchar(24) DEFAULT '1 pc' NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"mrp" numeric(10, 2),
	"stock" integer DEFAULT 0 NOT NULL,
	"photo" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grocery_order_items" ADD CONSTRAINT "grocery_order_items_order_id_grocery_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."grocery_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grocery_order_items" ADD CONSTRAINT "grocery_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grocery_orders" ADD CONSTRAINT "grocery_orders_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grocery_orders" ADD CONSTRAINT "grocery_orders_store_id_grocery_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."grocery_stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grocery_reviews" ADD CONSTRAINT "grocery_reviews_order_id_grocery_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."grocery_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grocery_reviews" ADD CONSTRAINT "grocery_reviews_store_id_grocery_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."grocery_stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grocery_reviews" ADD CONSTRAINT "grocery_reviews_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grocery_stores" ADD CONSTRAINT "grocery_stores_partner_id_users_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_store_id_grocery_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."grocery_stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_store_id_grocery_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."grocery_stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grocery_order_items_order_idx" ON "grocery_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grocery_orders_customer_idx" ON "grocery_orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grocery_orders_store_idx" ON "grocery_orders" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grocery_orders_status_idx" ON "grocery_orders" USING btree ("store_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "grocery_orders_order_ref_idx" ON "grocery_orders" USING btree ("order_ref");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "grocery_reviews_order_unique_idx" ON "grocery_reviews" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grocery_reviews_store_idx" ON "grocery_reviews" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grocery_stores_partner_idx" ON "grocery_stores" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grocery_stores_city_idx" ON "grocery_stores" USING btree ("city");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_categories_store_idx" ON "product_categories" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_store_idx" ON "products" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_category_idx" ON "products" USING btree ("category_id");