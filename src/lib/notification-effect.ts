import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/** Finestra in cui si guarda l'effetto di una notifica. */
export const EFFECT_HOURS = 72;

export type NotificationEffect = {
  id: number;
  created_at: Date;
  segment: string;
  city: string | null;
  title: string;
  body: string;
  recipients: number;
  /** Destinatari salvati: 0 per le notifiche inviate prima che si salvasse l'elenco. */
  tracked: number;
  /** Destinatari che hanno fatto almeno una corsa nelle 72 ore dopo l'invio. */
  riders: number;
  rides: number;
  revenue: number;
  subs: number;
  subs_revenue: number;
  /** Stesse misure, stessi utenti, nelle stesse ore della settimana prima: il loro ritmo normale. */
  riders_before: number;
  rides_before: number;
  revenue_before: number;
  subs_before: number;
  /** La finestra di 72 ore non è ancora finita. */
  running: boolean;
};

/**
 * Effetto delle notifiche reali degli ultimi 90 giorni: cosa hanno fatto i destinatari nelle 72 ore dopo
 * l'invio, confrontato con le stesse 72 ore di una settimana prima (stesso giorno della settimana, stessi utenti).
 */
export async function notificationEffects(limit = 30): Promise<NotificationEffect[]> {
  const rows = await db.execute<NotificationEffect>(sql`
    select n.id, n.created_at, n.segment, c.name as city, n.title, n.body, n.recipients,
      (select count(*)::int from notification_recipients nr where nr.notification_id = n.id) as tracked,
      coalesce(a.riders, 0)::int as riders, coalesce(a.rides, 0)::int as rides, coalesce(a.revenue, 0)::float as revenue,
      coalesce(b.riders, 0)::int as riders_before, coalesce(b.rides, 0)::int as rides_before, coalesce(b.revenue, 0)::float as revenue_before,
      coalesce(sa.n, 0)::int as subs, coalesce(sa.revenue, 0)::float as subs_revenue, coalesce(sb.n, 0)::int as subs_before,
      (now() < n.created_at + make_interval(hours => ${EFFECT_HOURS})) as running
    from notifications n
    left join cities c on c.id = n.city_id
    -- finché le 72 ore non sono finite si confronta con lo stesso numero di ore della settimana prima
    cross join lateral (select least(make_interval(hours => ${EFFECT_HOURS}), now() - n.created_at) as win) w
    left join lateral (
      select count(distinct r.customer_atom_id) as riders, count(*) as rides, sum(r.price) as revenue
      from notification_recipients nr join rides r on r.customer_atom_id = nr.customer_atom_id
      where nr.notification_id = n.id
        and r.start_time >= n.created_at and r.start_time < n.created_at + w.win
    ) a on true
    left join lateral (
      select count(distinct r.customer_atom_id) as riders, count(*) as rides, sum(r.price) as revenue
      from notification_recipients nr join rides r on r.customer_atom_id = nr.customer_atom_id
      where nr.notification_id = n.id
        and r.start_time >= n.created_at - interval '7 days'
        and r.start_time < n.created_at - interval '7 days' + w.win
    ) b on true
    left join lateral (
      select count(*) as n, sum(s.price) as revenue
      from notification_recipients nr join subscriptions s on s.customer_atom_id = nr.customer_atom_id
      where nr.notification_id = n.id
        and s.purchased_at >= n.created_at and s.purchased_at < n.created_at + w.win
    ) sa on true
    left join lateral (
      select count(*) as n
      from notification_recipients nr join subscriptions s on s.customer_atom_id = nr.customer_atom_id
      where nr.notification_id = n.id
        and s.purchased_at >= n.created_at - interval '7 days'
        and s.purchased_at < n.created_at - interval '7 days' + w.win
    ) sb on true
    where n.test = false and n.status = 'inviata' and n.created_at > now() - interval '90 days'
    order by n.created_at desc
    limit ${limit}`);
  return rows.map((r) => ({ ...r, created_at: new Date(r.created_at) }));
}

/** Quota di destinatari che hanno usato un mezzo nella finestra (0–1), null se non misurabile. */
export function responseRate(riders: number, tracked: number): number | null {
  return tracked > 0 ? riders / tracked : null;
}

/**
 * Il testo che ha funzionato meglio: tra le notifiche con finestra conclusa e almeno 30 destinatari,
 * quella con il maggior aumento di utenti attivi rispetto alla settimana prima.
 */
export function bestNotification(effects: NotificationEffect[]): number | null {
  let best: { id: number; lift: number } | null = null;
  for (const e of effects) {
    if (e.running || e.tracked < 30) continue;
    const lift = (e.riders - e.riders_before) / e.tracked;
    if (lift > 0 && (!best || lift > best.lift)) best = { id: e.id, lift };
  }
  return best?.id ?? null;
}
