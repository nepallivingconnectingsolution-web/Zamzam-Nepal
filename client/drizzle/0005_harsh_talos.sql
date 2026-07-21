CREATE TYPE "public"."food_order_status" AS ENUM('PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_type" AS ENUM('delivery', 'pickup');--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'restaurant' BEFORE 'admin';--> statement-breakpoint
ALTER TYPE "public"."txn_type" ADD VALUE 'FOOD' BEFORE 'TOPUP';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "food_order_items" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"order_id" varchar(32) NOT NULL,
	"menu_item_id" varchar(32),
	"name" text NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"is_veg" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "food_orders" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"order_ref" varchar(16) NOT NULL,
	"customer_id" varchar(32) NOT NULL,
	"restaurant_id" varchar(32) NOT NULL,
	"status" "food_order_status" DEFAULT 'PENDING' NOT NULL,
	"fulfillment" "fulfillment_type" NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"delivery_address" text,
	"note" text,
	"restaurant_snapshot" jsonb NOT NULL,
	"items_total" numeric(12, 2) NOT NULL,
	"delivery_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"service_fee" numeric(12, 2) NOT NULL,
	"grand_total" numeric(12, 2) NOT NULL,
	"method" varchar(32),
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "food_reviews" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"order_id" varchar(32) NOT NULL,
	"restaurant_id" varchar(32) NOT NULL,
	"customer_id" varchar(32) NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu_categories" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"restaurant_id" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu_items" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"restaurant_id" varchar(32) NOT NULL,
	"category_id" varchar(32),
	"name" text NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"is_veg" boolean DEFAULT false NOT NULL,
	"spice_level" integer DEFAULT 0 NOT NULL,
	"prep_time_min" integer DEFAULT 20 NOT NULL,
	"photo" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "restaurants" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"partner_id" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"address" text NOT NULL,
	"description" text,
	"cuisine" text DEFAULT 'Nepali' NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open_time" varchar(5) DEFAULT '09:00' NOT NULL,
	"close_time" varchar(5) DEFAULT '21:00' NOT NULL,
	"delivery_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"min_order" numeric(10, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "food_order_items" ADD CONSTRAINT "food_order_items_order_id_food_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."food_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "food_order_items" ADD CONSTRAINT "food_order_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "food_reviews" ADD CONSTRAINT "food_reviews_order_id_food_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."food_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "food_reviews" ADD CONSTRAINT "food_reviews_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "food_reviews" ADD CONSTRAINT "food_reviews_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_partner_id_users_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_order_items_order_idx" ON "food_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_orders_customer_idx" ON "food_orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_orders_restaurant_idx" ON "food_orders" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_orders_status_idx" ON "food_orders" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "food_orders_order_ref_idx" ON "food_orders" USING btree ("order_ref");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "food_reviews_order_unique_idx" ON "food_reviews" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_reviews_restaurant_idx" ON "food_reviews" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_categories_restaurant_idx" ON "menu_categories" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_items_restaurant_idx" ON "menu_items" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_items_category_idx" ON "menu_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "restaurants_partner_idx" ON "restaurants" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "restaurants_city_idx" ON "restaurants" USING btree ("city");