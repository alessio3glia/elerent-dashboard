CREATE TABLE "investor_vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"investor_id" integer NOT NULL,
	"vehicle_atom_id" integer NOT NULL,
	"from_day" date,
	"to_day" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"share_pct" double precision,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investors_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "investor_vehicles" ADD CONSTRAINT "investor_vehicles_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investor_vehicles_investor" ON "investor_vehicles" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "investor_vehicles_vehicle" ON "investor_vehicles" USING btree ("vehicle_atom_id");