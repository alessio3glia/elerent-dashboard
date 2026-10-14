-- Richiesta da "Aggiornamenti dashboard" (13/10/2026): la città si chiamava "mar Ionio" (minuscolo), sfuggita alla 0012.
UPDATE "cities" c SET "name" = 'Giardini Naxos', "slug" = 'giardini-naxos'
WHERE lower(c."name") = 'mar ionio'
	AND NOT EXISTS (SELECT 1 FROM "cities" o WHERE o.id <> c.id AND (lower(o."name") = 'giardini naxos' OR o."slug" = 'giardini-naxos'));
