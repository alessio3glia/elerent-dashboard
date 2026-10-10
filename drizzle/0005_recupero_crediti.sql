CREATE TABLE "debt_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_atom_id" integer NOT NULL,
	"status" text DEFAULT 'aperta' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"initial_debt" double precision NOT NULL,
	"max_debt" double precision NOT NULL,
	"current_debt" double precision NOT NULL,
	"stage" integer DEFAULT 0 NOT NULL,
	"last_email_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"recovered_amount" double precision,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "recovery_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" integer NOT NULL,
	"customer_atom_id" integer NOT NULL,
	"stage" integer NOT NULL,
	"email" text NOT NULL,
	"subject" text NOT NULL,
	"debt" double precision NOT NULL,
	"status" text NOT NULL,
	"provider_id" text,
	"error" text,
	"sent_by" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recovery_emails" ADD CONSTRAINT "recovery_emails_case_id_debt_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."debt_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debt_cases_customer" ON "debt_cases" USING btree ("customer_atom_id","status");--> statement-breakpoint
CREATE INDEX "debt_cases_status" ON "debt_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "recovery_emails_case" ON "recovery_emails" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "recovery_emails_sent" ON "recovery_emails" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "customers_debt" ON "customers" USING btree ("debt") WHERE debt > 0;