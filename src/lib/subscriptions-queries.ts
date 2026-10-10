import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { TZ } from "@/lib/dates";

/** Acquisti di abbonamenti per mese e città (ultimi 13 mesi). */
export async function subscriptionsByMonth() {
  return db.execute<{ month: string; city_id: number | null; n: number; revenue: number }>(sql`
    select to_char(purchased_at at time zone ${TZ}, 'YYYY-MM') as month, city_id, count(*)::int as n, coalesce(sum(price), 0)::float as revenue
    from subscriptions
    where purchased_at >= date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ} - interval '12 months'
    group by 1, 2`);
}

/** Acquisti del mese in corso per tipo di abbonamento. */
export async function subscriptionsByPlan() {
  return db.execute<{ name: string | null; n: number; revenue: number }>(sql`
    select name, count(*)::int as n, coalesce(sum(price), 0)::float as revenue
    from subscriptions
    where purchased_at >= date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ}
    group by 1 order by 2 desc`);
}

export async function latestSubscriptions(limit = 50) {
  return db.execute<{ id: number; name: string | null; price: number | null; purchased_at: Date | null; ends_at: Date | null; city_id: number | null; customer_atom_id: number | null }>(sql`
    select id, name, price, purchased_at, ends_at, city_id, customer_atom_id
    from subscriptions order by purchased_at desc nulls last limit ${limit}`);
}

export async function subscriptionsTotal() {
  const [row] = await db.execute<{ n: number; first: Date | null }>(sql`select count(*)::int as n, min(purchased_at) as first from subscriptions`);
  return row;
}
