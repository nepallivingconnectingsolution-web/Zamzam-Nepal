ALTER TABLE "hotels" ADD COLUMN "check_in_time" varchar(5) DEFAULT '12:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "check_out_time" varchar(5) DEFAULT '11:00' NOT NULL;