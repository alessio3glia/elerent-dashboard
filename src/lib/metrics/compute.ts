import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { TZ, addDays } from "@/lib/dates";
import { buildMetric, type SnapshotRow } from "./build";

const { cities, dailyMetrics } = schema;

async function snapshotsByDay(cityId: number, from: string, to: string) {
  const rows = await db.execute<SnapshotRow & { day: string }>(sql`
    with latest as (
      select (taken_at at time zone ${TZ})::date::text as day, max(taken_at) as taken_at
      from vehicle_snapshots
      where city_id = ${cityId} and (taken_at at time zone ${TZ})::date between ${from}::date and ${to}::date
      group by 1
    )
    select l.day, s.atom_id as "atomId", s.status, s.battery, s.lat, s.lng
    from latest l join vehicle_snapshots s on s.city_id = ${cityId} and s.taken_at = l.taken_at`);
  const out = new Map<string, SnapshotRow[]>();
  for (const { day, ...row } of rows) {
    if (!out.has(day)) out.set(day, []);
    out.get(day)!.push(row);
  }
  return out;
}

/** Calcola e salva i KPI giornalieri di tutte le città attive tra `from` e `to` (inclusi). */
export async function computeMetrics(from: string, to: string = from) {
  const activeCities = await db.select().from(cities).where(eq(cities.active, true));
  let saved = 0;
  for (const city of activeCities) {
    // Corse aggregate per giorno
    const totals = await db.execute<{ day: string; rides: number; revenue: number; customers: number }>(sql`
      select (start_time at time zone ${TZ})::date::text as day, count(*)::int as rides,
             coalesce(sum(price), 0)::float as revenue, count(distinct customer_atom_id)::int as customers
      from rides where city_id = ${city.id}
        and (start_time at time zone ${TZ})::date between ${addDays(from, -6)}::date and ${to}::date
      group by 1`);
    const byDay = new Map(totals.map((t) => [t.day, t]));

    // Coppie giorno/veicolo, per finestre a 3 e 7 giorni
    const pairs = await db.execute<{ day: string; v: number }>(sql`
      select distinct (start_time at time zone ${TZ})::date::text as day, vehicle_atom_id as v
      from rides where city_id = ${city.id} and vehicle_atom_id is not null
        and (start_time at time zone ${TZ})::date between ${addDays(from, -29)}::date and ${to}::date`);
    const vehiclesByDay = new Map<string, Set<number>>();
    for (const p of pairs) {
      if (!vehiclesByDay.has(p.day)) vehiclesByDay.set(p.day, new Set());
      vehiclesByDay.get(p.day)!.add(p.v);
    }
    const windowSet = (day: string, days: number) => {
      const s = new Set<number>();
      for (let i = 0; i < days; i++) vehiclesByDay.get(addDays(day, -i))?.forEach((v) => s.add(v));
      return s;
    };

    // Nuovi clienti: prima corsa in assoluto fatta in questa città
    const firsts = await db.execute<{ day: string; n: number }>(sql`
      select (r.start_time at time zone ${TZ})::date::text as day, count(*)::int as n
      from (
        select distinct on (customer_atom_id) customer_atom_id, city_id, start_time
        from rides where customer_atom_id is not null
        order by customer_atom_id, start_time
      ) r
      where r.city_id = ${city.id} and (r.start_time at time zone ${TZ})::date between ${from}::date and ${to}::date
      group by 1`);
    const newByDay = new Map(firsts.map((f) => [f.day, f.n]));

    const snaps = await snapshotsByDay(city.id, addDays(from, -1), to);

    for (let day = from; day <= to; day = addDays(day, 1)) {
      const t = byDay.get(day);
      const metric = buildMetric({
        day,
        revenueSharePct: city.revenueSharePct,
        feePerVehicleMonth: city.feePerVehicleMonth,
        rides: t?.rides ?? 0,
        revenue: t?.revenue ?? 0,
        uniqueCustomers: t?.customers ?? 0,
        newCustomers: newByDay.get(day) ?? 0,
        vehiclesWithRideToday: vehiclesByDay.get(day) ?? new Set(),
        vehiclesWithRecentRide: windowSet(day, 3),
        vehiclesActiveLast7: windowSet(day, 7).size,
        vehiclesActiveLast30: windowSet(day, 30).size,
        snapshot: snaps.get(day) ?? [],
        previousSnapshot: snaps.get(addDays(day, -1)) ?? [],
      });
      await db
        .insert(dailyMetrics)
        .values({ cityId: city.id, ...metric })
        .onConflictDoUpdate({ target: [dailyMetrics.cityId, dailyMetrics.day], set: metric });
      saved++;
    }
  }
  return { cities: activeCities.length, saved };
}

/** Primo giorno con corse salvate, per il ricalcolo completo dello storico. */
export async function firstRideDay(): Promise<string | null> {
  const [row] = await db.execute<{ day: string | null }>(
    sql`select (min(start_time) at time zone ${TZ})::date::text as day from rides`,
  );
  return row?.day ?? null;
}

