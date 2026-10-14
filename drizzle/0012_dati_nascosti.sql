CREATE TABLE IF NOT EXISTS "data_exclusions" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_id" integer NOT NULL,
	"from_day" date NOT NULL,
	"to_day" date NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN IF NOT EXISTS "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "data_exclusions" ADD CONSTRAINT "data_exclusions_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
-- Richieste da "Aggiornamenti dashboard" (13/10/2026): città nascoste, dati tenuti.
UPDATE "cities" SET "hidden" = true, "active" = false
WHERE "name" IN ('Ardea', 'Bari', 'Castiglione della Pescaia', 'Castellammare di Stabia', 'Acerra', 'Rende', 'Roma 2', 'Trapani');--> statement-breakpoint
-- Città rinominate, solo se il nuovo nome non è già di un'altra città.
UPDATE "cities" c SET "name" = v.new_name, "slug" = v.new_slug
FROM (VALUES
	('Agrigento', 'San Leone', 'san-leone'),
	('Golfo di Gaeta', 'Minturno', 'minturno'),
	('Mar Ionio', 'Giardini Naxos', 'giardini-naxos'),
	('Sarnico', 'Lago d''Iseo', 'lago-d-iseo')
) AS v(old_name, new_name, new_slug)
WHERE c."name" = v.old_name
	AND NOT EXISTS (SELECT 1 FROM "cities" o WHERE o.id <> c.id AND (lower(o."name") = lower(v.new_name) OR o."slug" = v.new_slug));--> statement-breakpoint
-- Messina: ottobre 2026 non si mostra.
INSERT INTO "data_exclusions" ("city_id", "from_day", "to_day", "reason")
SELECT c.id, '2026-10-01', '2026-10-31', 'Richiesta da Aggiornamenti dashboard (13/10/2026)'
FROM "cities" c
WHERE c."name" = 'Messina'
	AND NOT EXISTS (SELECT 1 FROM "data_exclusions" e WHERE e.city_id = c.id AND e.from_day = '2026-10-01' AND e.to_day = '2026-10-31');
