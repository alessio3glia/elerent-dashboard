import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { onStreet, signalling } from "@/lib/fleet-status";

/** Ogni quanto si registra la disponibilità dei mezzi. */
export const AVAILABILITY_EVERY_MS = 15 * 60_000;
/** Sotto questa batteria un mezzo non si considera disponibile per una corsa. */
const MIN_BATTERY = 15;

/**
 * Foto della disponibilità per città: disponibili = in strada con segnale, fermi e con batteria sufficiente;
 * in corsa = spostati negli ultimi 10 minuti. Si chiama dalla sync in tempo reale.
 */
export async function recordAvailability() {
  await db.execute(sql`
    insert into fleet_availability (city_id, at, available, in_ride, total)
    select v.city_id, now(),
      count(*) filter (where ${signalling()} and not moving
        and upper(coalesce(v.status, '')) in (${sql.join(onStreet().map((x) => sql`${x}`), sql`, `)})
        and (v.battery is null or v.battery >= ${MIN_BATTERY}))::int,
      count(*) filter (where moving)::int,
      count(*)::int
    from (select *, coalesce(moved_at >= now() - interval '10 minutes', false) as moving from vehicles) v
    where v.city_id is not null
    group by v.city_id`);
}

export type HourAvailability = { hour: string; available: number | null; inRide: number | null; rides: number };

/** Media per fascia oraria degli ultimi `days` giorni: mezzi disponibili contro corse partite in quell'ora. */
export async function availabilityByHour(cityId: number | undefined, days = 14): Promise<{ hours: HourAvailability[]; samples: number }> {
  const city = (col: string) => (cityId ? sql`${sql.raw(col)} = ${cityId}` : sql`true`);
  const [avail, rides] = await Promise.all([
    db.execute<{ h: number; available: number; in_ride: number; samples: number }>(sql`
      select h, avg(available)::float as available, avg(in_ride)::float as in_ride, count(*)::int as samples
      from (
        select date_trunc('minute', at) as t, extract(hour from at at time zone 'Europe/Rome')::int as h,
               sum(available) as available, sum(in_ride) as in_ride
        from fleet_availability
        where at >= now() - make_interval(days => ${days}::int) and ${city("city_id")}
        group by 1, 2
      ) x
      group by h`),
    db.execute<{ h: number; rides: number }>(sql`
      select extract(hour from start_time at time zone 'Europe/Rome')::int as h, (count(*)::float / ${days}) as rides
      from rides
      where start_time >= now() - make_interval(days => ${days}::int) and ${city("city_id")}
      group by 1`),
  ]);
  const hours = Array.from({ length: 24 }, (_, h) => {
    const a = avail.find((r) => r.h === h);
    return {
      hour: `${String(h).padStart(2, "0")}`,
      available: a ? Math.round(a.available * 10) / 10 : null,
      inRide: a ? Math.round(a.in_ride * 10) / 10 : null,
      rides: Math.round((rides.find((r) => r.h === h)?.rides ?? 0) * 10) / 10,
    };
  });
  return { hours, samples: avail.reduce((s, r) => s + r.samples, 0) };
}
