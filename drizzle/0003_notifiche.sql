-- Idempotente: un deploy di anteprima può aver già creato la tabella con la vecchia numerazione 0002.
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"segment" text NOT NULL,
	"city_id" integer,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"test" boolean DEFAULT false NOT NULL,
	"status" text NOT NULL,
	"recipients" integer DEFAULT 0 NOT NULL,
	"onesignal_ids" jsonb,
	"error" text,
	"sent_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "notifications" ADD CONSTRAINT "notifications_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_created" ON "notifications" USING btree ("created_at");
