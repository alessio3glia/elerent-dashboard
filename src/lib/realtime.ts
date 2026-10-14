import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { liveVehicles } from "@/lib/fleet-status";
import { getLiveState } from "@/lib/live";
import { shownRides } from "@/lib/shown-data";

/** Inizio di oggi in ora italiana. */
const todayStart = sql`(date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome')`;

export type PaceRow = {
  city_id: number | null;
  /** Corse di oggi fino a adesso. */
  today: number;
  /** Stesso giorno della settimana scorsa, fino alla stessa ora. */
  week1: number;
  /** Media degli stessi giorni delle ultime 4 settimane, fino alla stessa ora: meno sensibile al caso. */
  avg4: number;
  /** Totale dell'intera giornata della settimana scorsa. */
  week1Day: number;
};

/** Ritmo di oggi per città: corse fino a quest'ora contro lo stesso giorno delle settimane precedenti. */
export async function paceByCity(): Promise<PaceRow[]> {
  const rows = await db.execute<{ city_id: number | null; today: number; w1: number; w2: number; w3: number; w4: number; w1_day: number }>(sql`
    select city_id,
      count(*) filter (where start_time >= ${todayStart})::int as today,
      count(*) filter (where start_time >= ${todayStart} - interval '7 days' and start_time < now() - interval '7 days')::int as w1,
      count(*) filter (where start_time >= ${todayStart} - interval '14 days' and start_time < now() - interval '14 days')::int as w2,
      count(*) filter (where start_time >= ${todayStart} - interval '21 days' and start_time < now() - interval '21 days')::int as w3,
      count(*) filter (where start_time >= ${todayStart} - interval '28 days' and start_time < now() - interval '28 days')::int as w4,
      count(*) filter (where start_time >= ${todayStart} - interval '7 days' and start_time < ${todayStart} - interval '6 days')::int as w1_day
    from rides
    where start_time >= ${todayStart} - interval '28 days' and ${shownRides()}
    group by city_id`);
  return rows.map((r) => ({ city_id: r.city_id, today: r.today, week1: r.w1, avg4: (r.w1 + r.w2 + r.w3 + r.w4) / 4, week1Day: r.w1_day }));
}

/** Corse per ora di oggi e dello stesso giorno della settimana scorsa (rete intera o una città). */
export async function hourlyToday(cityId?: number) {
  const rows = await db.execute<{ h: number; today: number; week1: number }>(sql`
    select extract(hour from start_time at time zone 'Europe/Rome')::int as h,
      count(*) filter (where start_time >= ${todayStart})::int as today,
      count(*) filter (where start_time < ${todayStart} - interval '6 days')::int as week1
    from rides
    where ((start_time >= ${todayStart}) or (start_time >= ${todayStart} - interval '7 days' and start_time < ${todayStart} - interval '6 days'))
      and ${cityId ? sql`city_id = ${cityId}` : sql`true`} and ${shownRides()}
    group by 1`);
  const nowHour = Number(new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(new Date())) % 24;
  let a = 0;
  let b = 0;
  return Array.from({ length: 24 }, (_, h) => {
    const r = rows.find((x) => x.h === h);
    a += r?.today ?? 0;
    b += r?.week1 ?? 0;
    return { hour: `${String(h).padStart(2, "0")}:00`, today: h <= nowHour ? a : null, week1: b };
  });
}

/** Variazione percentuale, solo se il confronto ha abbastanza corse per avere senso. */
export function paceDelta(today: number, before: number, minBase = 5): number | null {
  if (before < minBase) return null;
  return (today - before) / before;
}

export type Health = "verde" | "giallo" | "rosso";
export type CityHealth = {
  cityId: number;
  health: Health;
  reasons: string[];
  pace: number | null;
  today: number;
  vehicles: number;
  signalling: number;
  lowBattery: number;
};

/**
 * Semaforo per città: mette insieme ritmo delle corse (contro la media delle ultime 4 settimane alla stessa ora),
 * mezzi che mandano segnale e batterie scariche. Rosso = da guardare subito, giallo = da tenere d'occhio.
 */
export function judgeCity(input: { pace: PaceRow | undefined; vehicles: number; signalling: number; lowBattery: number; hour: number }): {
  health: Health;
  reasons: string[];
  pace: number | null;
} {
  const reasons: { level: Health; text: string }[] = [];
  const today = input.pace?.today ?? 0;
  const base = input.pace?.avg4 ?? 0;
  const pace = paceDelta(today, base);
  if (pace !== null && pace <= -0.4) reasons.push({ level: "rosso", text: `corse ${Math.round(pace * 100)}% rispetto al solito a quest'ora` });
  else if (pace !== null && pace <= -0.2) reasons.push({ level: "giallo", text: `corse ${Math.round(pace * 100)}% rispetto al solito a quest'ora` });
  if (today === 0 && base >= 5 && input.hour >= 11) reasons.push({ level: "rosso", text: "nessuna corsa oggi" });
  if (input.vehicles > 0) {
    const share = input.signalling / input.vehicles;
    if (share < 0.5) reasons.push({ level: "rosso", text: `solo ${input.signalling} mezzi su ${input.vehicles} mandano segnale` });
    else if (share < 0.75) reasons.push({ level: "giallo", text: `${input.vehicles - input.signalling} mezzi senza segnale` });
    if (input.signalling > 0) {
      const low = input.lowBattery / input.signalling;
      if (low > 0.4) reasons.push({ level: "rosso", text: `${input.lowBattery} mezzi con batteria sotto il 20%` });
      else if (low > 0.2) reasons.push({ level: "giallo", text: `${input.lowBattery} mezzi con batteria sotto il 20%` });
    }
  }
  const health: Health = reasons.some((r) => r.level === "rosso") ? "rosso" : reasons.length ? "giallo" : "verde";
  return { health, pace, reasons: reasons.sort((a, b) => (a.level === "rosso" ? -1 : 0) - (b.level === "rosso" ? -1 : 0)).map((r) => r.text) };
}

/** Semaforo di tutte le città indicate (di solito quelle attive). */
export async function cityHealth(cityIds: number[]): Promise<CityHealth[]> {
  const [pace, vehicles] = await Promise.all([paceByCity(), liveVehicles()]);
  const hour = Number(new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(new Date())) % 24;
  return cityIds.map((cityId) => {
    const mine = vehicles.filter((v) => v.cityId === cityId);
    const on = mine.filter((v) => v.state !== "spento");
    const lowBattery = on.filter((v) => v.battery !== null && v.battery < 20).length;
    const p = pace.find((r) => r.city_id === cityId);
    const judged = judgeCity({ pace: p, vehicles: mine.length, signalling: on.length, lowBattery, hour });
    return { cityId, ...judged, today: p?.today ?? 0, vehicles: mine.length, signalling: on.length, lowBattery };
  });
}

/** Dopo quanti minuti senza sincronizzazione i dati si considerano fermi. */
export const STALE_MINUTES = 15;

/** Minuti trascorsi da un istante ISO (null se manca). */
export function minutesSince(iso: string | undefined | null): number | null {
  return iso ? (Date.now() - Date.parse(iso)) / 60_000 : null;
}

/** Quando sono stati aggiornati l'ultima volta corse, mezzi e abbonamenti. */
export async function freshness() {
  const [live, [last]] = await Promise.all([
    getLiveState(),
    db.execute<{ ride: Date | null; subs: Date | null }>(sql`
      select (select max(coalesce(end_time, start_time)) from rides where start_time >= now() - interval '3 days') as ride,
             (select max(updated_at) from sync_state where key = 'subscriptions') as subs`),
  ]);
  const at = live?.at ? new Date(live.at) : null;
  const minutes = at ? (Date.now() - at.getTime()) / 60_000 : null;
  return {
    syncAt: at,
    fleetAt: live?.fleetAt ? new Date(live.fleetAt) : null,
    lastRideAt: last?.ride ? new Date(last.ride) : null,
    subscriptionsAt: last?.subs ? new Date(last.subs) : null,
    error: live?.error ?? null,
    stale: minutes === null || minutes > STALE_MINUTES,
    minutes,
  };
}
