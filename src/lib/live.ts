import "server-only";
import { eq, max, sql } from "drizzle-orm";
import { AtomClient, atomAccountFromEnv } from "@/lib/atom/client";
import { db, schema } from "@/lib/db";
import { addDays, localDay } from "@/lib/dates";
import type { CityArea } from "@/lib/geo";
import { computeMetrics } from "@/lib/metrics/compute";
import { acquireLock, activeAreas, getBackfillState, releaseLock, saveRides, syncVehicles, updateLastRides } from "@/lib/sync/sync";

const { rides, vehicles, syncState } = schema;

const LIVE_KEY = "live";
const LIVE_LOCK = "live_lock";
/** Ogni quanto si scaricano le corse nuove quando qualcuno usa la dashboard. */
export const LIVE_EVERY_MS = 2 * 60_000;
/** Posizione e stato dei veicoli si aggiornano meno spesso (foto della flotta). */
const FLEET_EVERY_MS = 15 * 60_000;

type LiveState = { at: string; fleetAt?: string; rides?: number; error?: string | null };

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
  if (!(await acquireLock(LIVE_LOCK, 120_000))) return { skipped: "già in corso" };

  const next: LiveState = { ...state, at: new Date().toISOString(), error: null };
  try {
    const client = new AtomClient(atomAccountFromEnv());
    let areas: CityArea[] = await activeAreas();
    let vehicleCity: Map<number, number | null>;
    if (!state?.fleetAt || Date.now() - Date.parse(state.fleetAt) > FLEET_EVERY_MS) {
      const fleet = await syncVehicles(client, areas);
      areas = fleet.areas;
      vehicleCity = fleet.vehicleCity;
      next.fleetAt = next.at;
    } else {
      vehicleCity = new Map((await db.select({ a: vehicles.atomId, c: vehicles.cityId }).from(vehicles)).map((v) => [v.a, v.c]));
    }
    // Un'ora di margine sull'ultima corsa salvata: le corse finiscono in ritardo rispetto all'inizio.
    const [{ last }] = await db.select({ last: max(rides.startTime) }).from(rides);
    const since = last ? new Date(new Date(last).getTime() - 3_600_000) : new Date(Date.now() - 86_400_000);
    next.rides = await saveRides(await client.ridesSince(since, 30), vehicleCity, areas, since);
    await updateLastRides();
    // KPI di ieri (il giorno di oggi è parziale e si legge nel riquadro "Oggi").
    const yesterday = addDays(localDay(), -1);
    await computeMetrics(yesterday, yesterday);
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
    where (start_time at time zone 'Europe/Rome')::date = (now() at time zone 'Europe/Rome')::date
    group by city_id`);
}
