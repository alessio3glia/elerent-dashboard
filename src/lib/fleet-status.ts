import "server-only";
import { sql } from "drizzle-orm";
import { ON_STREET } from "@/lib/atom/parse";
import { db } from "@/lib/db";
import { TZ } from "@/lib/dates";

/** Un veicolo "manda segnale" se l'abbiamo sentito nelle ultime 24 ore. */
export const SIGNAL_HOURS = 24;

const onStreet = () => {
  const extra = (process.env.ATOM_ON_STREET_STATUSES ?? "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
  return [...ON_STREET, ...extra];
};

/** Condizione SQL: il veicolo `v` è acceso e in strada (segnale recente, oppure stato operativo all'ultima sync). */
const signalling = () => sql`(
  v.last_signal_at >= now() - make_interval(hours => ${SIGNAL_HOURS}::int)
  or (upper(v.status) in (${sql.join(onStreet().map((x) => sql`${x}`), sql`, `)}) and v.updated_at >= now() - interval '1 hour')
)`;

export type FleetStatusRow = { city_id: number | null; paganti: number; operativi: number; non_attivi: number };

/**
 * Stato dei veicoli nel mese di calendario in corso, per città:
 * paganti = almeno una corsa dal primo del mese; operativi = nessuna corsa ma mandano segnale; non attivi = né corse né segnale.
 */
export async function fleetStatusThisMonth() {
  return db.execute<FleetStatusRow>(sql`
    with month_start as (select (date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ}) as t),
    paying as (
      select distinct on (vehicle_atom_id) vehicle_atom_id, city_id
      from rides, month_start
      where vehicle_atom_id is not null and start_time >= month_start.t
      order by vehicle_atom_id, start_time desc
    ),
    others as (
      select v.city_id, ${signalling()} as on_air
      from vehicles v
      where not exists (select 1 from paying p where p.vehicle_atom_id = v.atom_id)
    )
    select city_id, sum(paganti)::int as paganti, sum(operativi)::int as operativi, sum(non_attivi)::int as non_attivi
    from (
      select city_id, 1 as paganti, 0 as operativi, 0 as non_attivi from paying
      union all
      select city_id, 0, case when on_air then 1 else 0 end, case when on_air then 0 else 1 end from others
    ) x
    group by city_id`);
}

export type LiveVehicle = {
  id: number;
  number: string | null;
  lat: number;
  lng: number;
  state: "corsa" | "operativo" | "spento";
  battery: number | null;
  cityId: number | null;
};

/** Veicoli per la mappa live: in corsa (spostati negli ultimi 10 minuti), operativi o spenti. */
export async function liveVehicles(): Promise<LiveVehicle[]> {
  const rows = await db.execute<{ id: number; number: string | null; lat: number; lng: number; battery: number | null; city_id: number | null; moving: boolean; on_air: boolean }>(sql`
    select v.atom_id as id, v.number, v.lat, v.lng, v.battery, v.city_id,
           (v.moved_at >= now() - interval '10 minutes' or upper(v.status) in ('IN_USE', 'IN_RIDE', 'RIDING', 'RIDE')) as moving,
           ${signalling()} as on_air
    from vehicles v
    where v.lat is not null and v.lng is not null and (v.lat <> 0 or v.lng <> 0)`);
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    lat: r.lat,
    lng: r.lng,
    battery: r.battery,
    cityId: r.city_id,
    state: r.moving ? "corsa" : r.on_air ? "operativo" : "spento",
  }));
}

/** Corse finite negli ultimi `minutes` minuti, con il punto di arrivo: sulla mappa si accendono. */
export async function recentRideEnds(minutes = 30) {
  return db.execute<{ id: number; lat: number; lng: number; end_time: Date; price: number | null }>(sql`
    select atom_id as id, end_lat as lat, end_lng as lng, coalesce(end_time, start_time) as end_time, price
    from rides
    where start_time >= now() - interval '6 hours' and coalesce(end_time, start_time) >= now() - make_interval(mins => ${minutes}::int)
      and end_lat is not null and end_lng is not null`);
}
