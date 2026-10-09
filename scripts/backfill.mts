// Import completo dello storico da Atom e ricalcolo dei KPI. Uso: npm run backfill
import { closeDb } from "@/lib/db";
import { runBackfill } from "@/lib/pipeline";

// Da riga di comando non ci sono limiti di durata: un unico blocco lungo
console.log(JSON.stringify(await runBackfill(24 * 3_600_000, true), null, 2));
await closeDb();
