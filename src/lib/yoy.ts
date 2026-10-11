import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { TZ } from "@/lib/dates";

/**
 * Corse di un giorno passato fino alla stessa ora di adesso, per città:
 * serve a confrontare "oggi finora" con lo stesso giorno della settimana dell'anno prima.
 */
export async function ridesSoFarOn(day: string) {
  return db.execute<{ city_id: number | null; rides: number; revenue: number; vehicles: number }>(sql`
    select city_id, count(*)::int as rides, coalesce(sum(price), 0)::float as revenue, count(distinct vehicle_atom_id)::int as vehicles
    from rides
    where start_time >= (${day}::date::timestamp at time zone ${TZ})
      and start_time < ((${day}::date::timestamp + ((now() at time zone ${TZ}) - (now() at time zone ${TZ})::date::timestamp)) at time zone ${TZ})
    group by city_id`);
}
