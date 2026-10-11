CREATE TABLE IF NOT EXISTS "dashboard_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer,
	"user_name" text NOT NULL,
	"kind" text NOT NULL,
	"city_id" integer,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"text" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "dashboard_updates" ADD CONSTRAINT "dashboard_updates_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_updates_city" ON "dashboard_updates" USING btree ("city_id","starts_on");
