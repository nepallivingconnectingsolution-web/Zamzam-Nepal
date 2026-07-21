CREATE TABLE IF NOT EXISTS "platform_settings" (
	"id" varchar(32) PRIMARY KEY DEFAULT 'platform' NOT NULL,
	"platform_name" text DEFAULT 'Zamzam Super App' NOT NULL,
	"support_email" varchar(255) DEFAULT 'support@zamzam.com.np' NOT NULL,
	"support_phone" varchar(20) DEFAULT '+977-1-4000000' NOT NULL,
	"service_fee_percent" numeric(5, 2) DEFAULT '2.00' NOT NULL,
	"maintenance_mode" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" varchar(32)
);
