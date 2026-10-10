import "server-only";
import { eq, max, sql } from "drizzle-orm";
import { AtomClient, atomAccountFromEnv } from "@/lib/atom/client";
import { db, schema } from "@/lib/db";
import { addDays, localDay } from "@/lib/dates";
import type { CityArea } from "@/lib/geo";
import { computeMetrics } from "@/lib/metrics/compute";
import { nameCities, updateCityActivity } from "@/lib/sync/cities";
import { getSubscriptionsState, syncSubscriptions } from "@/lib/sync/subscriptions";
import { acquireLock, activeAreas, countNewCustomers, getBackfillState, releaseLock, saveCustomers, saveRides, slugify, syncVehicles, updateLastRides } from "@/lib/sync/sync";

const { rides, vehicles, syncState } = schema;

const LIVE_KEY = "live";
const LIVE_LOCK = "live_lock";
/** Ogni quanto si scaricano le corse nuove quando qualcuno usa la dashboard. */
export const LIVE_EVERY_MS = 2 * 60_000;
/** Foto della flotta per i KPI giornalieri: una ogni 6 ore basta (posizioni e stato si aggiornano a ogni giro). */
const SNAPSHOT_EVERY_MS = 6 * 3_600_000;
/** Nomi e attività delle città: una volta l'ora. */
const CITIES_EVERY_MS = 3_600_000;
/** Versione del calcolo KPI: quando cambia, si ricalcolano il mese in corso e quello prima. */
const METRICS_VERSION = 2;

type LiveState = {
  at: string;
  fleetAt?: string;
  snapshotAt?: string;
  citiesAt?: string;
  metricsVersion?: number;
  rides?: number;
  vehicles?: number;
  customers?: number;
  subscriptions?: number;
  error?: string | null;
};

const older = (iso: string | undefined, ms: number) => !iso || Date.now() - Date.parse(iso) > ms;

export async function getLiveState(): Promise<LiveState | null> {
  const [row] = await db.select().from(syncState).where(eq(syncState.key, LIVE_KEY));
  return (row?.value as LiveState) ?? null;
}

/**
 * Sincronizzazione "in tempo reale": scarica da Atom le corse finite dall'ultima salvata,
 * aggiorna ogni 15 minuti la flotta e ricalcola i KPI di ieri. Leggera (poche pagine), con lock.
 */
export async function liveSync(force = false) {
  const state = await getLiveState();
  if (!force && state && Date.now() - Date.parse(state.at) < LIVE_EVERY_MS) return { skipped: "recente" };
  const backfill = await getBackfillState();
  if (backfill && !backfill.done) return { skipped: "import storico in corso" };
  if (!(await acquireLock(LIVE_LOCK, 280_000))) return { skipped: "già in corso" };

  const next: LiveState = { ...state, at: new Date().toISOString(), error: null };
  const errors: string[] = [];
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : String(error)}`);
    }
  };
  try {
    const client = new AtomClient(atomAccountFromEnv());
    let areas: CityArea[] = await activeAreas();
    let vehicleCity = new Map((await db.select({ a: vehicles.atomId, c: vehicles.cityId }).from(vehicles)).map((v) => [v.a, v.c]));

    // Veicoli: posizione, stato, batteria e segnale a ogni giro (per la mappa live).
    await step("veicoli", async () => {
      const snapshot = older(state?.snapshotAt, SNAPSHOT_EVERY_MS);
      const fleet = await syncVehicles(client, areas, { snapshot });
      areas = fleet.areas;
      vehicleCity = fleet.vehicleCity;
      next.vehicles = fleet.vehicles;
      next.fleetAt = next.at;
      if (snapshot) next.snapshotAt = next.at;
    });

    // Corse: un'ora di margine sull'ultima corsa salvata, perché le corse finiscono dopo essere iniziate.
    await step("corse", async () => {
      const [{ last }] = await db.select({ last: max(rides.startTime) }).from(rides);
      const since = last ? new Date(new Date(last).getTime() - 3_600_000) : new Date(Date.now() - 86_400_000);
      next.rides = await saveRides(await client.ridesSince(since, 30), vehicleCity, areas, since);
      await updateLastRides(since);
    });

    // Utenti nuovi: le prime pagine di Atom (dal più recente), finché ne arrivano di nuovi.
    await step("utenti", async () => {
      let bookmark: string | null = null;
      let saved = 0;
      for (let i = 0; i < 5; i++) {
        const page = await client.customersPage(bookmark);
        const fresh = await countNewCustomers(page.customers.map((c) => c.id));
        await saveCustomers(page.customers);
        saved += fresh;
        if (!page.next || fresh === 0) break;
        bookmark = page.next;
      }
      next.customers = saved;
    });

    // Abbonamenti acquistati: tutto lo storico al primo giro (a blocchi), poi solo i nuovi.
    await step("abbonamenti", async () => {
      // Finché lo storico non è completo si dà più tempo (60 s) a ogni giro.
      const done = (await getSubscriptionsState()).done;
      next.subscriptions = (await syncSubscriptions(client, Date.now() + (done ? 30_000 : 60_000))).fresh;
    });

    // Città: nomi veri e solo quelle operative nell'ultimo anno.
    if (older(state?.citiesAt, CITIES_EVERY_MS)) {
      await step("città", async () => {
        await nameCities(slugify, Date.now() + 25_000);
        await updateCityActivity();
        next.citiesAt = next.at;
      });
    }

    // KPI: ieri a ogni giro (oggi è parziale e si legge nel riquadro "Oggi"); se il calcolo è cambiato, anche il mese prima.
    await step("analytics", async () => {
      const yesterday = addDays(localDay(), -1);
      if (state?.metricsVersion !== METRICS_VERSION) {
        const [y, m] = yesterday.split("-").map(Number);
        const prevMonth = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
        await computeMetrics(prevMonth, yesterday);
        next.metricsVersion = METRICS_VERSION;
      } else {
        await computeMetrics(yesterday, yesterday);
      }
    });
    next.error = errors.length ? errors.join(" · ").slice(0, 300) : null;
  } catch (error) {
    next.error = error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message).slice(0, 300) : String(error);
  } finally {
    await db
      .insert(syncState)
      .values({ key: LIVE_KEY, value: next, updatedAt: new Date() })
      .onConflictDoUpdate({ target: syncState.key, set: { value: next, updatedAt: new Date() } });
    await releaseLock(LIVE_LOCK);
  }
  return next;
}

/** Totali di oggi per città, letti direttamente dalle corse (aggiornati a ogni sincronizzazione). */
export async function todayByCity() {
  return db.execute<{ city_id: number | null; rides: number; revenue: number; vehicles: number; last_ride: Date | null }>(sql`
    select city_id, count(*)::int as rides, coalesce(sum(price), 0)::float as revenue,
           count(distinct vehicle_atom_id)::int as vehicles, max(start_time) as last_ride
    from rides
    where start_time >= ${todayStart}
    group by city_id`);
}

/** Inizio di oggi (ora italiana), in una forma che usa l'indice su start_time. */
const todayStart = sql`(date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome')`;

/** Abbonamenti comprati oggi, per città. */
export async function todaySubscriptionsByCity() {
  return db.execute<{ city_id: number | null; n: number; revenue: number }>(sql`
    select city_id, count(*)::int as n, coalesce(sum(price), 0)::float as revenue
    from subscriptions where purchased_at >= ${todayStart}
    group by city_id`);
}
