import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { addDays, localDay } from "@/lib/dates";
import { computeMetrics, firstRideDay } from "@/lib/metrics/compute";
import { generateDailyTasks } from "@/lib/rules/run";
import { syncFromAtom } from "@/lib/sync/sync";

/** Corse rimaste senza città (es. città aggiunta dopo): le assegna in base al veicolo. */
export async function assignMissingCities() {
  await db.execute(sql`
    update rides r set city_id = v.city_id
    from vehicles v
    where r.city_id is null and v.city_id is not null and r.vehicle_atom_id = v.atom_id`);
}

/** Job giornaliero: sync incrementale, KPI degli ultimi 3 giorni, task di oggi. */
export async function runDaily() {
  const sync = await syncFromAtom();
  await assignMissingCities();
  const today = localDay();
  const metrics = await computeMetrics(addDays(today, -3), addDays(today, -1));
  const tasks = await generateDailyTasks(today);
  return { sync, metrics, tasks };
}

/** Import completo dello storico Atom e ricalcolo di tutti i KPI. */
export async function runBackfill() {
  const sync = await syncFromAtom({ fullHistory: true });
  await assignMissingCities();
  const today = localDay();
  const first = await firstRideDay();
  const metrics = first ? await computeMetrics(first, addDays(today, -1)) : null;
  const tasks = await generateDailyTasks(today);
  return { sync, metrics, tasks };
}

/** Ricalcolo dei KPI senza chiamare Atom (dopo aver cambiato aree, % o fee). */
export async function recomputeAll() {
  await assignMissingCities();
  const today = localDay();
  const first = await firstRideDay();
  return first ? computeMetrics(first, addDays(today, -1)) : null;
}
