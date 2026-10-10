import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { TZ } from "@/lib/dates";

/** Fatturato delle corse per giorno e città (per la quota % giornaliera). */
export async function revenueByDay(from: string, to: string) {
  return db.execute<{ day: string; city_id: number; revenue: number; rides: number }>(sql`
    select (start_time at time zone ${TZ})::date::text as day, city_id, coalesce(sum(price), 0)::float as revenue, count(*)::int as rides
    from rides
    where city_id is not null
      and start_time >= (${from}::date::timestamp at time zone ${TZ})
      and start_time < ((${to}::date + 1)::timestamp at time zone ${TZ})
    group by 1, 2`);
}

/** Incasso abbonamenti per mese e città. */
export async function subscriptionRevenueByMonth() {
  return db.execute<{ month: string; city_id: number | null; n: number; revenue: number }>(sql`
    select to_char(purchased_at at time zone ${TZ}, 'YYYY-MM') as month, city_id, count(*)::int as n, coalesce(sum(price), 0)::float as revenue
    from subscriptions where purchased_at is not null
    group by 1, 2`);
}

/** Corse non pagate: debito aperto degli utenti secondo Atom (aggiornato ogni notte con l'elenco utenti). */
export async function unpaidDebt() {
  const [row] = await db.execute<{ users: number; debt: number }>(sql`
    select count(*) filter (where debt > 0)::int as users, coalesce(sum(debt) filter (where debt > 0), 0)::float as debt
    from customers`);
  return row ?? { users: 0, debt: 0 };
}
