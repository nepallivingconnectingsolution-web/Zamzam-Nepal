CREATE TABLE IF NOT EXISTS "cms_content" (
	"id" varchar(32) PRIMARY KEY DEFAULT 'cms' NOT NULL,
	"banners" jsonb NOT NULL,
	"service_flags" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" varchar(32)
);
