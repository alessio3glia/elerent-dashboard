import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { addDays, localDay } from "@/lib/dates";
import { computeMetrics, firstRideDay } from "@/lib/metrics/compute";
import { generateDailyTasks } from "@/lib/rules/run";
import { nameCities, updateCityActivity } from "@/lib/sync/cities";
import { getRecoverySettings, sendDue } from "@/lib/recovery";
import { rescanSubscriptions } from "@/lib/sync/subscriptions";
import { backfillStep, slugify, syncFromAtom } from "@/lib/sync/sync";

const { syncState } = schema;
const FULL_RECOMPUTE_KEY = "metrics_v2_full";

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
  // Una volta al giorno si rilegge tutto lo storico abbonamenti (la sync live prende solo i nuovi).
  await rescanSubscriptions();
  await nameCities(slugify);
  await assignMissingCities();
  await updateCityActivity();
  const today = localDay();
  // Calcolo KPI cambiato (fee sui veicoli paganti del mese): una volta si ricalcola tutto lo storico.
  const [full] = await db.select().from(syncState).where(eq(syncState.key, FULL_RECOMPUTE_KEY));
  const metrics = full ? await computeMetrics(addDays(today, -3), addDays(today, -1)) : await recomputeAll();
  if (!full) await db.insert(syncState).values({ key: FULL_RECOMPUTE_KEY, value: { at: new Date().toISOString() }, updatedAt: new Date() }).onConflictDoNothing();
  const tasks = await generateDailyTasks(today);
  // Sequenza di solleciti: parte da sola solo se una persona ha acceso l'invio automatico in Recupero.
  const settings = await getRecoverySettings();
  const recovery = settings.auto ? await sendDue("Invio automatico") : null;
  return { sync, metrics, tasks, recovery };
}

/**
 * Import dello storico a blocchi. Ogni chiamata lavora per `budgetMs` e riprende da dove era arrivata;
 * all'ultimo blocco ricalcola tutti i KPI e le task di oggi.
 */
export async function runBackfill(budgetMs = 240_000, restart = false) {
  const state = await backfillStep(budgetMs, restart);
  await nameCities(slugify);
  if (!state.done) {
    // La dashboard si riempie mentre l'import va avanti: KPI subito per i giorni appena scaricati.
    const yesterday = addDays(localDay(), -1);
    if (state.touchedFrom && state.touchedFrom <= yesterday) {
      await assignMissingCities();
      // +30 giorni: i KPI a finestra mobile (veicoli attivi a 30 gg) dipendono anche dalle corse più vecchie.
      const end = addDays(state.touchedTo ?? yesterday, 30);
      const to = end < yesterday ? end : yesterday;
      await computeMetrics(state.touchedFrom, to);
    }
    return { state };
  }
  await assignMissingCities();
  const activity = await updateCityActivity();
  const metrics = await recomputeAll();
  const tasks = await generateDailyTasks(localDay());
  return { state, metrics, tasks, activity };
}

/** Ricalcolo dei KPI senza chiamare Atom (dopo aver cambiato aree, % o fee). */
export async function recomputeAll() {
  await assignMissingCities();
  const today = localDay();
  const first = await firstRideDay();
  return first ? computeMetrics(first, addDays(today, -1)) : null;
}
