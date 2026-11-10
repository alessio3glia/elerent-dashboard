import "server-only";
import { eq, sql } from "drizzle-orm";
import { AtomClient, DATE_RANGE_SHAPES, atomAccountFromEnv } from "@/lib/atom/client";
import { db, schema } from "@/lib/db";
import { addDays, localDay } from "@/lib/dates";
import { activeAreas, getBackfillState, saveRides, updateLastRides } from "@/lib/sync/sync";

const { syncState, vehicles } = schema;

/** Giorni ancora da rileggere da Atom per intero (corse perse quando la sync è rimasta ferma a lungo). */
const REPAIR_KEY = "rides_repair";
/** Ogni notte si rileggono per intero gli ultimi giorni, così un buco lasciato dalla sync live si chiude da solo. */
export const REPAIR_LAST_DAYS = 3;

type RepairState = { from: string | null; to?: string | null; updatedAt?: string; lastDay?: string; lastError?: string | null };

export async function getRepairState(): Promise<RepairState> {
  const [row] = await db.select().from(syncState).where(eq(syncState.key, REPAIR_KEY));
  return (row?.value as RepairState) ?? { from: null };
}

async function saveRepairState(state: RepairState) {
  const value = { ...state, updatedAt: new Date().toISOString() };
  await db
    .insert(syncState)
    .values({ key: REPAIR_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: syncState.key, set: { value, updatedAt: new Date() } });
}

/** Chiede di rileggere da Atom tutti i giorni da `from` a oggi (si allarga se c'era già una richiesta più vecchia). */
export async function requestRepair(from: string) {
  const state = await getRepairState();
  if (state.from && state.from <= from) return;
  await saveRepairState({ ...state, from, to: null });
}

/** Corse salvate per giorno (ora italiana), per controllare il prima e il dopo. */
export async function ridesPerDay(from: string, to: string) {
  const rows = await db.execute<{ day: string; n: number }>(sql`
    select to_char(start_time at time zone 'Europe/Rome', 'YYYY-MM-DD') as day, count(*)::int as n
    from rides
    where start_time >= (${from}::date at time zone 'Europe/Rome') and start_time < ((${to}::date + 1) at time zone 'Europe/Rome')
    group by 1 order by 1`);
  return Object.fromEntries(rows.map((r) => [r.day, r.n])) as Record<string, number>;
}

/**
 * Rilegge da Atom, giorno per giorno con il filtro per data, tutte le corse da `from` a `to`
 * e salva quelle mancanti (le altre si aggiornano). Si ferma a `deadline` e dice da dove riprendere.
 */
export async function reimportRides(from: string, to: string, deadline: number, client = new AtomClient(atomAccountFromEnv())) {
  const shape = (await getBackfillState())?.rangeShape || "from/to giorno";
  const build = DATE_RANGE_SHAPES[shape] ?? DATE_RANGE_SHAPES["from/to giorno"];
  const areas = await activeAreas();
  const vehicleCity = new Map((await db.select({ a: vehicles.atomId, c: vehicles.cityId }).from(vehicles)).map((v) => [v.a, v.c]));
  const days: { day: string; atom: number }[] = [];
  let day = from;
  while (day <= to && Date.now() < deadline) {
    let bookmark: string | null = null;
    let atom = 0;
    let complete = false;
    // Un giorno si salva a pagine; se il tempo finisce a metà, si ricomincia quel giorno al giro dopo.
    for (let i = 0; i < 200 && Date.now() < deadline; i++) {
      const page = await client.ridesPage(bookmark, build(day, day));
      await saveRides(page.rides, vehicleCity, areas);
      atom += page.rides.length;
      bookmark = page.next;
      if (!bookmark) {
        complete = true;
        break;
      }
    }
    if (!complete) break;
    days.push({ day, atom });
    day = addDays(day, 1);
  }
  if (days.length) await updateLastRides(new Date(`${days[0].day}T00:00:00Z`));
  return { days, next: day <= to ? day : null };
}

/**
 * Passo della riparazione chiamato dalla sync live: se ci sono giorni da rileggere, ne fa quanti
 * ne stanno in `budgetMs`. Restituisce i giorni completati (vuoto se non c'era niente da fare).
 */
export async function repairStep(client: AtomClient, budgetMs: number) {
  const state = await getRepairState();
  if (!state.from) return { days: [] as { day: string; atom: number }[], pending: null as string | null };
  const today = localDay();
  const to = state.to && state.to < today ? state.to : today;
  try {
    const result = await reimportRides(state.from, to, Date.now() + budgetMs, client);
    await saveRepairState({ from: result.next, to: result.next ? state.to ?? null : null, lastDay: result.days.at(-1)?.day ?? state.lastDay, lastError: null });
    return { days: result.days, pending: result.next };
  } catch (error) {
    await saveRepairState({ ...state, lastError: error instanceof Error ? error.message.slice(0, 200) : String(error) });
    throw error;
  }
}
