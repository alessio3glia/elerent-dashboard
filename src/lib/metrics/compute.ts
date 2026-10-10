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

/** Limiti in UTC dei giorni locali [from, to], così le query usano l'indice su start_time. */
const dayStart = (day: string) => sql`(${day}::date::timestamp at time zone ${TZ})`;
const dayEnd = (day: string) => sql`((${day}::date + 1)::timestamp at time zone ${TZ})`;

/** Calcola e salva i KPI giornalieri di tutte le città attive tra `from` e `to` (inclusi). */
export async function computeMetrics(from: string, to: string = from) {
  const activeCities = await db.select().from(cities).where(eq(cities.active, true));
  // Le corse dal primo del mese di `from` (o da 29 giorni prima, se precede) servono per paganti e finestre a 3/7 giorni.
  const monthStart = `${from.slice(0, 7)}-01`;
  const pairsFrom = addDays(from, -29) < monthStart ? addDays(from, -29) : monthStart;

  // Nuovi clienti: prima corsa in assoluto, calcolata una volta sola per tutte le città
  const firsts = await db.execute<{ city_id: number; day: string; n: number }>(sql`
    select r.city_id, (r.start_time at time zone ${TZ})::date::text as day, count(*)::int as n
    from (
      select distinct on (customer_atom_id) customer_atom_id, city_id, start_time
      from rides where customer_atom_id is not null
      order by customer_atom_id, start_time
    ) r
    where r.start_time >= ${dayStart(from)} and r.start_time < ${dayEnd(to)}
    group by 1, 2`);
  const newByCityDay = new Map(firsts.map((f) => [`${f.city_id}:${f.day}`, f.n]));

  let saved = 0;
  for (const city of activeCities) {
    // Corse aggregate per giorno
    const totals = await db.execute<{ day: string; rides: number; revenue: number; customers: number }>(sql`
      select (start_time at time zone ${TZ})::date::text as day, count(*)::int as rides,
             coalesce(sum(price), 0)::float as revenue, count(distinct customer_atom_id)::int as customers
      from rides where city_id = ${city.id} and start_time >= ${dayStart(addDays(from, -6))} and start_time < ${dayEnd(to)}
      group by 1`);
    const byDay = new Map(totals.map((t) => [t.day, t]));

    // Coppie giorno/veicolo, per finestre a 3 e 7 giorni e per i veicoli paganti del mese
    const pairs = await db.execute<{ day: string; v: number }>(sql`
      select distinct (start_time at time zone ${TZ})::date::text as day, vehicle_atom_id as v
      from rides where city_id = ${city.id} and vehicle_atom_id is not null
        and start_time >= ${dayStart(pairsFrom)} and start_time < ${dayEnd(to)}`);
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

    const snaps = await snapshotsByDay(city.id, addDays(from, -1), to);

    // Veicoli paganti del mese, accumulati giorno per giorno
    let paying = new Set<number>();
    let payingMonth = "";
    for (let day = pairsFrom; day < from; day = addDays(day, 1)) {
      if (day.slice(0, 7) !== from.slice(0, 7)) continue;
      vehiclesByDay.get(day)?.forEach((v) => paying.add(v));
    }
    payingMonth = from.slice(0, 7);

    const values = [];
    for (let day = from; day <= to; day = addDays(day, 1)) {
      if (day.slice(0, 7) !== payingMonth) {
        paying = new Set();
        payingMonth = day.slice(0, 7);
      }
      const today = vehiclesByDay.get(day) ?? new Set<number>();
      const before = paying.size;
      today.forEach((v) => paying.add(v));
      const t = byDay.get(day);
      values.push({
        cityId: city.id,
        ...buildMetric({
          day,
          revenueSharePct: city.revenueSharePct,
          feePerVehicleMonth: city.feePerVehicleMonth,
          rides: t?.rides ?? 0,
          revenue: t?.revenue ?? 0,
          uniqueCustomers: t?.customers ?? 0,
          newCustomers: newByCityDay.get(`${city.id}:${day}`) ?? 0,
          vehiclesWithRideToday: today,
          vehiclesWithRecentRide: windowSet(day, 3),
          vehiclesActiveLast7: windowSet(day, 7).size,
          vehiclesPayingMonth: paying.size,
          newPayingToday: paying.size - before,
          snapshot: snaps.get(day) ?? [],
          previousSnapshot: snaps.get(addDays(day, -1)) ?? [],
        }),
      });
    }
    for (let i = 0; i < values.length; i += 200) {
      const part = values.slice(i, i + 200);
      await db
        .insert(dailyMetrics)
        .values(part)
        .onConflictDoUpdate({
          target: [dailyMetrics.cityId, dailyMetrics.day],
          set: Object.fromEntries(
            Object.keys(part[0]).filter((k) => k !== "cityId" && k !== "day").map((k) => [k, sql.raw(`excluded.${toSnake(k)}`)]),
          ),
        });
      saved += part.length;
    }
  }
  return { cities: activeCities.length, saved };
}

const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Primo giorno con corse salvate, per il ricalcolo completo dello storico. */
export async function firstRideDay(): Promise<string | null> {
  const [row] = await db.execute<{ day: string | null }>(
    sql`select (min(start_time) at time zone ${TZ})::date::text as day from rides`,
  );
  return row?.day ?? null;
}

