// Esegue a mano il job giornaliero (sync + KPI + task). Uso: npm run daily
import { closeDb } from "@/lib/db";
import { runDaily } from "@/lib/pipeline";

console.log(JSON.stringify(await runDaily(), null, 2));
await closeDb();
