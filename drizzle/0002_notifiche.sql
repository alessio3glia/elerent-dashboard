CREATE TABLE "notifications" (
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
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_created" ON "notifications" USING btree ("created_at");