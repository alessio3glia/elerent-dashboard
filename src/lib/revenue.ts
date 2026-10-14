import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { TZ } from "@/lib/dates";
import { shownRides } from "@/lib/shown-data";

/** Fatturato delle corse per giorno e città (per la quota % giornaliera). */
export async function revenueByDay(from: string, to: string) {
  return db.execute<{ day: string; city_id: number; revenue: number; rides: number }>(sql`
    select (start_time at time zone ${TZ})::date::text as day, city_id, coalesce(sum(price), 0)::float as revenue, count(*)::int as rides
    from rides
    where city_id is not null
      and start_time >= (${from}::date::timestamp at time zone ${TZ})
      and start_time < ((${to}::date + 1)::timestamp at time zone ${TZ})
      and ${shownRides()}
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

/** Abbonamenti venduti per città tra due giorni locali inclusi (per il confronto con gli stessi giorni dell'anno prima). */
export async function subscriptionsBetween(from: string, to: string) {
  return db.execute<{ city_id: number | null; n: number; revenue: number }>(sql`
    select city_id, count(*)::int as n, coalesce(sum(price), 0)::float as revenue
    from subscriptions
    where purchased_at >= (${from}::date::timestamp at time zone ${TZ})
      and purchased_at < ((${to}::date + 1)::timestamp at time zone ${TZ})
    group by 1`);
}

/**
 * Soldi delle corse di oggi (ora italiana): fatturato = prezzo di tutte le corse finite, anche in revisione;
 * incassato = scalato dal credito dell'utente; bonus = scalato dai bonus; non pagato = il resto.
 */
export async function todayMoney() {
  const [row] = await db.execute<{ rides: number; fatturato: number; incassato: number; bonus: number; non_pagato: number; unpaid_rides: number; in_review: number; in_review_amount: number }>(sql`
    select count(*)::int as rides,
      coalesce(sum(price), 0)::float as fatturato,
      coalesce(sum(charged_balance), 0)::float as incassato,
      coalesce(sum(charged_bonus), 0)::float as bonus,
      coalesce(sum(greatest(price - coalesce(charged_balance, 0) - coalesce(charged_bonus, 0), 0)), 0)::float as non_pagato,
      count(*) filter (where price - coalesce(charged_balance, 0) - coalesce(charged_bonus, 0) > 0.009)::int as unpaid_rides,
      count(*) filter (where status = 'IN_REVIEW')::int as in_review,
      coalesce(sum(price) filter (where status = 'IN_REVIEW'), 0)::float as in_review_amount
    from rides
    where start_time >= (date_trunc('day', now() at time zone ${TZ}) at time zone ${TZ}) and ${shownRides()}`);
  return row;
}
