import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { TZ } from "@/lib/dates";

/**
 * Condizione SQL per i dati da mostrare: esclude le città nascoste e i periodi esclusi
 * (tabella data_exclusions) decisi dai dipendenti da "Aggiornamenti dashboard". I dati restano nel database.
 * `city` è la colonna con l'id della città, qualificata con la tabella; `day` un'espressione di tipo date (giorno italiano).
 */
export function shownData(city: SQL, day: SQL): SQL {
  return sql`not exists (select 1 from cities hc where hc.id = ${city} and hc.hidden)
    and not exists (select 1 from data_exclusions de where de.city_id = ${city} and ${day} between de.from_day and de.to_day)`;
}

/**
 * Come `shownData` per la tabella delle corse (`alias` se la query le dà un altro nome).
 * Le colonne vanno sempre qualificate: dentro le sottoquery `city_id` da solo sarebbe quella di data_exclusions.
 */
export function shownRides(alias = "rides"): SQL {
  return shownData(sql.raw(`${alias}.city_id`), sql`(${sql.raw(`${alias}.start_time`)} at time zone ${TZ})::date`);
}

/** Solo città nascoste, per dati senza data (veicoli sulla mappa). */
export function shownCity(city: SQL): SQL {
  return sql`not exists (select 1 from cities hc where hc.id = ${city} and hc.hidden)`;
}

/** Città con un periodo escluso che comprende oggi: il semaforo non le giudica. */
export async function citiesExcludedToday(): Promise<number[]> {
  const rows = await db.execute<{ city_id: number }>(sql`
    select distinct city_id from data_exclusions
    where (now() at time zone ${TZ})::date between from_day and to_day`);
  return rows.map((r) => r.city_id);
}
