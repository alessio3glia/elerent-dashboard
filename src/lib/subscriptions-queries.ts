import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { TZ } from "@/lib/dates";

/** Acquisti di abbonamenti per mese e città (ultimi 25 mesi, per il confronto con l'anno prima). */
export async function subscriptionsByMonth() {
  return db.execute<{ month: string; city_id: number | null; n: number; revenue: number }>(sql`
    select to_char(purchased_at at time zone ${TZ}, 'YYYY-MM') as month, city_id, count(*)::int as n, coalesce(sum(price), 0)::float as revenue
    from subscriptions
    where purchased_at >= date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ} - interval '24 months'
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

/**
 * Classifica dei tipi di abbonamento: mese in corso e ultimi 12 mesi,
 * ciascuno con lo stesso periodo dell'anno prima (per il mese in corso, gli stessi giorni).
 */
export async function subscriptionPlanRanking() {
  return db.execute<{
    name: string | null;
    n_month: number; rev_month: number; n_month_ly: number; rev_month_ly: number;
    n_year: number; rev_year: number; n_year_ly: number; rev_year_ly: number;
  }>(sql`
    with b as (
      select date_trunc('month', now() at time zone ${TZ}) as m, now() at time zone ${TZ} as t
    ), s as (
      select name, price, purchased_at at time zone ${TZ} as at from subscriptions
      where purchased_at >= (select (t - interval '24 months') at time zone ${TZ} from b)
    )
    select s.name,
      count(*) filter (where at >= b.m)::int as n_month,
      coalesce(sum(price) filter (where at >= b.m), 0)::float as rev_month,
      count(*) filter (where at >= b.m - interval '1 year' and at < b.t - interval '1 year')::int as n_month_ly,
      coalesce(sum(price) filter (where at >= b.m - interval '1 year' and at < b.t - interval '1 year'), 0)::float as rev_month_ly,
      count(*) filter (where at >= b.t - interval '12 months')::int as n_year,
      coalesce(sum(price) filter (where at >= b.t - interval '12 months'), 0)::float as rev_year,
      count(*) filter (where at < b.t - interval '12 months')::int as n_year_ly,
      coalesce(sum(price) filter (where at < b.t - interval '12 months'), 0)::float as rev_year_ly
    from s, b
    group by s.name
    order by n_year desc, n_month desc`);
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

/** Mese in corso fino ad ora, contro gli stessi giorni del mese prima, per città. */
export async function subscriptionsMonthToDate() {
  return db.execute<{ city_id: number | null; n: number; revenue: number; prev_n: number; prev_revenue: number }>(sql`
    with b as (
      select date_trunc('month', now() at time zone ${TZ}) as m, now() at time zone ${TZ} as t
    )
    select city_id,
      count(*) filter (where purchased_at >= b.m at time zone ${TZ})::int as n,
      coalesce(sum(price) filter (where purchased_at >= b.m at time zone ${TZ}), 0)::float as revenue,
      count(*) filter (where purchased_at < b.m at time zone ${TZ} and purchased_at < (b.t - interval '1 month') at time zone ${TZ})::int as prev_n,
      coalesce(sum(price) filter (where purchased_at < b.m at time zone ${TZ} and purchased_at < (b.t - interval '1 month') at time zone ${TZ}), 0)::float as prev_revenue
    from subscriptions, b
    where purchased_at >= (b.m - interval '1 month') at time zone ${TZ}
    group by city_id`);
}
