CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"atom_id" text NOT NULL,
	"city_id" integer,
	"customer_atom_id" integer,
	"name" text,
	"price" double precision,
	"purchased_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"status" text,
	"place" text,
	"raw" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_atom_id_unique" UNIQUE("atom_id")
);
--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "end_lat" double precision;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "end_lng" double precision;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "last_signal_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "moved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_purchased" ON "subscriptions" USING btree ("purchased_at");--> statement-breakpoint
CREATE INDEX "subscriptions_city" ON "subscriptions" USING btree ("city_id","purchased_at");--> statement-breakpoint
CREATE INDEX "rides_start" ON "rides" USING btree ("start_time");