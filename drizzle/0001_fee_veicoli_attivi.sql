ALTER TABLE "cities" ALTER COLUMN "revenue_share_pct" SET DEFAULT 10;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "fee_per_vehicle_month" SET DEFAULT 15;--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD COLUMN "fee_vehicles" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Condizioni Elerent comunicate da Alessio: 10% sul fatturato e 15 € per veicolo attivo nei 30 giorni
UPDATE "cities" SET "revenue_share_pct" = 10, "fee_per_vehicle_month" = 15 WHERE "revenue_share_pct" = 0 AND "fee_per_vehicle_month" = 0;
