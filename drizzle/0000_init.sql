CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" integer NOT NULL,
	"day" date NOT NULL,
	"rule" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'operatore' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"affiliate_name" text,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"center_lat" double precision,
	"center_lng" double precision,
	"radius_km" double precision DEFAULT 15 NOT NULL,
	"revenue_share_pct" double precision DEFAULT 0 NOT NULL,
	"fee_per_vehicle_month" double precision DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_contact_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"atom_id" integer NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"registered_at" timestamp with time zone,
	"wallet" double precision,
	"debt" double precision,
	"rides" integer,
	"blocked" boolean,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_atom_id_unique" UNIQUE("atom_id")
);
--> statement-breakpoint
CREATE TABLE "daily_metrics" (
	"city_id" integer NOT NULL,
	"day" date NOT NULL,
	"estimated" boolean DEFAULT false NOT NULL,
	"rides" integer DEFAULT 0 NOT NULL,
	"revenue" double precision DEFAULT 0 NOT NULL,
	"fleet_size" integer DEFAULT 0 NOT NULL,
	"active_vehicles" integer DEFAULT 0 NOT NULL,
	"vehicles_with_ride" integer DEFAULT 0 NOT NULL,
	"idle_vehicles" integer DEFAULT 0 NOT NULL,
	"low_battery" integer DEFAULT 0 NOT NULL,
	"stationary_vehicles" integer DEFAULT 0 NOT NULL,
	"unique_customers" integer DEFAULT 0 NOT NULL,
	"new_customers" integer DEFAULT 0 NOT NULL,
	"elerent_revenue" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_metrics_city_id_day_pk" PRIMARY KEY("city_id","day")
);
--> statement-breakpoint
CREATE TABLE "rides" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" integer,
	"atom_id" integer NOT NULL,
	"vehicle_atom_id" integer,
	"customer_atom_id" integer,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"km" double precision,
	"minutes" double precision,
	"price" double precision DEFAULT 0 NOT NULL,
	"charged_balance" double precision,
	"charged_bonus" double precision,
	"with_subscription" boolean,
	CONSTRAINT "rides_atom_id_unique" UNIQUE("atom_id")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"message" text,
	"counts" jsonb
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" integer NOT NULL,
	"alert_id" integer,
	"day" date NOT NULL,
	"rule" text NOT NULL,
	"kind" text NOT NULL,
	"priority" integer NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"action" text NOT NULL,
	"status" text DEFAULT 'aperta' NOT NULL,
	"note" text,
	"completed_by" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" integer,
	"taken_at" timestamp with time zone NOT NULL,
	"atom_id" integer NOT NULL,
	"status" text,
	"battery" integer,
	"lat" double precision,
	"lng" double precision
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" integer,
	"atom_id" integer NOT NULL,
	"number" text,
	"model" text,
	"status" text,
	"battery" integer,
	"lat" double precision,
	"lng" double precision,
	"total_rides" integer,
	"last_park_date" timestamp with time zone,
	"last_ride_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_atom_id_unique" UNIQUE("atom_id")
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_snapshots" ADD CONSTRAINT "vehicle_snapshots_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_city_day_rule" ON "alerts" USING btree ("city_id","day","rule");--> statement-breakpoint
CREATE INDEX "customers_registered" ON "customers" USING btree ("registered_at");--> statement-breakpoint
CREATE INDEX "rides_city_start" ON "rides" USING btree ("city_id","start_time");--> statement-breakpoint
CREATE INDEX "rides_customer" ON "rides" USING btree ("customer_atom_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_city_day_rule" ON "tasks" USING btree ("city_id","day","rule");--> statement-breakpoint
CREATE INDEX "snapshots_city_time" ON "vehicle_snapshots" USING btree ("city_id","taken_at");--> statement-breakpoint
CREATE INDEX "vehicles_city" ON "vehicles" USING btree ("city_id");