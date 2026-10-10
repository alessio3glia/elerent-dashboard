import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { TZ, addDays, localDay } from "@/lib/dates";

const { cities, dailyMetrics, alerts, tasks, syncRuns, vehicles } = schema;

export async function listCities() {
  return db.select().from(cities).orderBy(asc(cities.name));
}

export async function getCity(slug: string) {
  const [city] = await db.select().from(cities).where(eq(cities.slug, slug));
  return city ?? null;
}

/** Ultimo giorno con KPI calcolati (di norma ieri). */
export async function lastMetricDay(): Promise<string> {
  const [row] = await db.select({ d: sql<string | null>`max(${dailyMetrics.day})::text` }).from(dailyMetrics);
  return row?.d ?? addDays(localDay(), -1);
}

export async function firstMetricDay(): Promise<string | null> {
  const [row] = await db.select({ d: sql<string | null>`min(${dailyMetrics.day})::text` }).from(dailyMetrics);
  return row?.d ?? null;
}

export async function metricsBetween(from: string, to: string, cityIds?: number[]) {
  return db
    .select()
    .from(dailyMetrics)
    .where(
      and(
        gte(dailyMetrics.day, from),
        lte(dailyMetrics.day, to),
        cityIds ? inArray(dailyMetrics.cityId, cityIds) : undefined,
      ),
    )
    .orderBy(asc(dailyMetrics.day));
}

export async function tasksForDay(day: string) {
  return db
    .select({ task: tasks, city: cities })
    .from(tasks)
    .innerJoin(cities, eq(cities.id, tasks.cityId))
    .where(sql`${tasks.day} = ${day} or (${tasks.status} = 'aperta' and ${tasks.day} >= ${addDays(day, -7)})`)
    .orderBy(asc(tasks.status), asc(tasks.priority), desc(tasks.day), asc(cities.name));
}

export async function tasksForCity(cityId: number, limit = 30) {
  return db.select().from(tasks).where(eq(tasks.cityId, cityId)).orderBy(desc(tasks.day), asc(tasks.priority)).limit(limit);
}

export async function recentAlerts(days = 14, cityId?: number) {
  return db
    .select({ alert: alerts, city: cities })
    .from(alerts)
    .innerJoin(cities, eq(cities.id, alerts.cityId))
    .where(and(gte(alerts.day, addDays(localDay(), -days)), cityId ? eq(alerts.cityId, cityId) : undefined))
    .orderBy(desc(alerts.day), sql`case ${alerts.severity} when 'critical' then 0 when 'warning' then 1 else 2 end`);
}

export async function lastSync() {
  const [run] = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1);
  return run ?? null;
}

export async function cityVehicles(cityId: number) {
  return db.select().from(vehicles).where(eq(vehicles.cityId, cityId));
}

export type MonthRow = { cityId: number; month: string; vehicles: number; rides: number; revenue: number; customers: number };

/**
 * Totali mensili per città ricostruiti direttamente dalle corse.
 * "vehicles" = veicoli diversi con almeno una corsa nel mese in quella città.
 * Con `untilDay` conta solo i giorni del mese fino a quel numero (per confrontare un mese in corso con lo stesso periodo dell'anno prima).
 */
export async function monthlyFromRides(opts: { months?: string[]; untilDay?: number } = {}): Promise<MonthRow[]> {
  const month = sql`to_char(start_time at time zone ${TZ}, 'YYYY-MM')`;
  const conditions = [sql`city_id is not null`];
  if (opts.months?.length) conditions.push(sql`${month} in (${sql.join(opts.months.map((m) => sql`${m}`), sql`, `)})`);
  if (opts.untilDay) conditions.push(sql`extract(day from start_time at time zone ${TZ}) <= ${opts.untilDay}`);
  return db.execute<MonthRow>(sql`
    select city_id as "cityId", ${month} as month,
           count(distinct vehicle_atom_id)::int as vehicles, count(*)::int as rides,
           coalesce(sum(price), 0)::float as revenue, count(distinct customer_atom_id)::int as customers
    from rides where ${sql.join(conditions, sql` and `)}
    group by 1, 2`);
}
