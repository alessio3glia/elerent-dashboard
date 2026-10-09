// Import completo dello storico da Atom e ricalcolo dei KPI. Uso: npm run backfill
import { closeDb } from "@/lib/db";
import { runBackfill } from "@/lib/pipeline";

console.log(JSON.stringify(await runBackfill(), null, 2));
await closeDb();
