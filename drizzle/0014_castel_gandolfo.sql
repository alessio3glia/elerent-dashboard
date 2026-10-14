-- Richiesta da "Aggiornamenti dashboard" (14/10/2026): Castel Gandolfo c'è su Atom ma non qui,
-- perché i suoi mezzi cadevano nel raggio delle città vicine. Nuova area di 5 km sul centro del paese.
INSERT INTO "cities" ("slug", "name", "center_lat", "center_lng", "radius_km")
SELECT 'castel-gandolfo', 'Castel Gandolfo', 41.7475, 12.6505, 5
WHERE NOT EXISTS (SELECT 1 FROM "cities" WHERE lower("name") = 'castel gandolfo' OR "slug" = 'castel-gandolfo');--> statement-breakpoint
-- Storico: le corse finite entro 5 km dal centro di Castel Gandolfo, e più vicine a lui che al centro
-- della città a cui erano assegnate, passano a Castel Gandolfo.
WITH cg AS (SELECT id, center_lat AS lat, center_lng AS lng FROM "cities" WHERE "slug" = 'castel-gandolfo'),
dist AS (
	SELECT r.id,
		2 * 6371 * asin(sqrt(power(sin(radians(r.end_lat - cg.lat) / 2), 2) + cos(radians(cg.lat)) * cos(radians(r.end_lat)) * power(sin(radians(r.end_lng - cg.lng) / 2), 2))) AS d_cg,
		CASE WHEN c.center_lat IS NULL THEN NULL ELSE
			2 * 6371 * asin(sqrt(power(sin(radians(r.end_lat - c.center_lat) / 2), 2) + cos(radians(c.center_lat)) * cos(radians(r.end_lat)) * power(sin(radians(r.end_lng - c.center_lng) / 2), 2))) END AS d_now
	FROM "rides" r CROSS JOIN cg LEFT JOIN "cities" c ON c.id = r.city_id
	WHERE r.end_lat IS NOT NULL AND r.end_lng IS NOT NULL AND r.city_id IS DISTINCT FROM cg.id
		AND r.end_lat BETWEEN cg.lat - 0.05 AND cg.lat + 0.05 AND r.end_lng BETWEEN cg.lng - 0.07 AND cg.lng + 0.07
)
UPDATE "rides" r SET "city_id" = (SELECT id FROM cg)
FROM dist
WHERE r.id = dist.id AND dist.d_cg <= 5 AND (dist.d_now IS NULL OR dist.d_cg < dist.d_now);--> statement-breakpoint
-- KPI da ricalcolare su tutto lo storico al prossimo giro notturno (le corse hanno cambiato città).
DELETE FROM "sync_state" WHERE "key" = 'metrics_v2_full';
