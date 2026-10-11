CREATE TABLE IF NOT EXISTS "fleet_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" integer,
	"at" timestamp with time zone NOT NULL,
	"available" integer NOT NULL,
	"in_ride" integer NOT NULL,
	"total" integer NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fleet_availability" ADD CONSTRAINT "fleet_availability_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fleet_availability_city_at" ON "fleet_availability" USING btree ("city_id","at");
