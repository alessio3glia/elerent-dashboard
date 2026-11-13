import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { TZ } from "@/lib/dates";
import { onStreet, signalling } from "@/lib/fleet-status";

/** Stesso giorno di calendario dell'anno prima (il 29 febbraio diventa 28). */
export function dayLastYear(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
  return `${y - 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Quota dell'investitore sul lordo; null se non ha una percentuale. */
export function investorShare(gross: number, sharePct: number | null): number | null {
  return sharePct === null || sharePct === undefined ? null : (gross * sharePct) / 100;
}

/**
 * Corse dei veicoli dell'investitore dentro il periodo di possesso (giorno italiano).
 * Si escludono i periodi esclusi da "Aggiornamenti dashboard" (dati sbagliati), non le città nascoste:
 * all'investitore interessano i soldi dei suoi mezzi ovunque si trovino.
 */
const ownedRides = (investorId: number) => sql`
  rides r
  join investor_vehicles iv on iv.vehicle_atom_id = r.vehicle_atom_id and iv.investor_id = ${investorId}
    and (r.start_time at time zone ${TZ})::date between coalesce(iv.from_day, '1900-01-01'::date) and coalesce(iv.to_day, '9999-12-31'::date)
  where not exists (
    select 1 from data_exclusions de
    where de.city_id = r.city_id and (r.start_time at time zone ${TZ})::date between de.from_day and de.to_day
  )`;

const between = (from: string, to: string) => sql`
  r.start_time >= (${from}::date::timestamp at time zone ${TZ})
  and r.start_time < ((${to}::date + 1)::timestamp at time zone ${TZ})`;

export type InvestorVehicle = {
  atom_id: number;
  number: string | null;
  model: string | null;
  status: string | null;
  battery: number | null;
  lat: number | null;
  lng: number | null;
  last_ride_at: Date | null;
  city: string | null;
  from_day: string | null;
  to_day: string | null;
  on_air: boolean;
  known: boolean;
};

/** Veicoli assegnati all'investitore (anche quelli non ancora visti da Atom), con stato attuale. */
export async function investorVehicles(investorId: number) {
  const rows = await db.execute<InvestorVehicle & { last_ride_at: string | Date | null }>(sql`
    select iv.vehicle_atom_id as atom_id, v.number, v.model, v.status, v.battery, v.lat, v.lng,
           coalesce(v.last_ride_at, (select max(start_time) from rides x where x.vehicle_atom_id = iv.vehicle_atom_id)) as last_ride_at,
           c.name as city, iv.from_day::text as from_day, iv.to_day::text as to_day,
           coalesce(${signalling()}, false) as on_air, (v.id is not null) as known
    from investor_vehicles iv
    left join vehicles v on v.atom_id = iv.vehicle_atom_id
    left join cities c on c.id = v.city_id
    where iv.investor_id = ${investorId}
    order by v.number nulls last, iv.vehicle_atom_id`);
  return rows.map((r) => ({ ...r, last_ride_at: r.last_ride_at ? new Date(r.last_ride_at) : null }));
}

export type VehicleTotals = { rides: number; km: number; minutes: number; revenue: number; ride_days: number };
export const EMPTY_TOTALS: VehicleTotals = { rides: 0, km: 0, minutes: 0, revenue: 0, ride_days: 0 };

/** Corse, km, minuti, lordo e giorni con corse per veicolo tra due giorni inclusi (null = da sempre). */
export async function totalsByVehicle(investorId: number, from: string | null, to: string | null) {
  const rows = await db.execute<VehicleTotals & { atom_id: number }>(sql`
    select r.vehicle_atom_id as atom_id, count(*)::int as rides, coalesce(sum(r.km), 0)::float as km,
           coalesce(sum(r.minutes), 0)::float as minutes, coalesce(sum(r.price), 0)::float as revenue,
           count(distinct (r.start_time at time zone ${TZ})::date)::int as ride_days
    from ${ownedRides(investorId)}
      ${from && to ? sql`and ${between(from, to)}` : sql``}
    group by 1`);
  return new Map(rows.map((r) => [r.atom_id, r]));
}

export function sumTotals(map: Map<number, VehicleTotals>): VehicleTotals & { vehicles: number } {
  const t = { ...EMPTY_TOTALS, vehicles: 0 };
  for (const v of map.values()) {
    t.rides += v.rides;
    t.km += v.km;
    t.minutes += v.minutes;
    t.revenue += v.revenue;
    t.ride_days += v.ride_days;
    if (v.rides > 0) t.vehicles += 1;
  }
  return t;
}

export type InvestorMonth = { month: string; rides: number; km: number; revenue: number; vehicles: number };

/** Totali per mese (YYYY-MM) di tutti i veicoli dell'investitore, dall'inizio dello storico. */
export async function investorMonthly(investorId: number) {
  return db.execute<InvestorMonth>(sql`
    select to_char(r.start_time at time zone ${TZ}, 'YYYY-MM') as month, count(*)::int as rides,
           coalesce(sum(r.km), 0)::float as km, coalesce(sum(r.price), 0)::float as revenue,
           count(distinct r.vehicle_atom_id)::int as vehicles
    from ${ownedRides(investorId)}
    group by 1 order by 1`);
}

/**
 * Giorni in strada per veicolo tra due giorni inclusi, dalle foto della flotta: un giorno conta se almeno una foto
 * trova il veicolo in uno stato operativo. `days` = giorni con almeno una foto, base della percentuale.
 */
export async function onStreetDays(investorId: number, from: string, to: string) {
  const statuses = onStreet();
  const rows = await db.execute<{ atom_id: number; on_street: number; days: number }>(sql`
    select s.atom_id, count(distinct (s.taken_at at time zone ${TZ})::date) filter (
             where upper(s.status) in (${sql.join(statuses.map((x) => sql`${x}`), sql`, `)}))::int as on_street,
           count(distinct (s.taken_at at time zone ${TZ})::date)::int as days
    from vehicle_snapshots s
    join investor_vehicles iv on iv.vehicle_atom_id = s.atom_id and iv.investor_id = ${investorId}
      and (s.taken_at at time zone ${TZ})::date between coalesce(iv.from_day, '1900-01-01'::date) and coalesce(iv.to_day, '9999-12-31'::date)
    where s.taken_at >= (${from}::date::timestamp at time zone ${TZ})
      and s.taken_at < ((${to}::date + 1)::timestamp at time zone ${TZ})
    group by 1`);
  return new Map(rows.map((r) => [r.atom_id, r]));
}

/** Somma i giorni in strada di tutti i veicoli: percentuale di disponibilità della flotta dell'investitore. */
export function uptime(map: Map<number, { on_street: number; days: number }>): number | null {
  let on = 0;
  let days = 0;
  for (const v of map.values()) {
    on += v.on_street;
    days += v.days;
  }
  return days > 0 ? on / days : null;
}
