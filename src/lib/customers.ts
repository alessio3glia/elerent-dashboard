import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const SEGMENTS = {
  nuovi: {
    label: "Nuovi",
    description: "Prima corsa negli ultimi 30 giorni.",
    push: "Benvenuto bonus sulla seconda e terza corsa per creare l'abitudine.",
  },
  abituali: {
    label: "Abituali",
    description: "Almeno 4 corse negli ultimi 30 giorni.",
    push: "Proporre un abbonamento o un pacchetto minuti: spendono già, li fidelizziamo.",
  },
  occasionali: {
    label: "Occasionali",
    description: "Da 1 a 3 corse negli ultimi 30 giorni.",
    push: "Promo nei momenti in cui hanno già usato il servizio (stesso giorno/orario).",
  },
  in_calo: {
    label: "In calo",
    description: "Meno della metà delle corse rispetto ai 30 giorni precedenti.",
    push: "Notifica personalizzata con sconto a tempo: rischiano di smettere.",
  },
  dormienti: {
    label: "Dormienti",
    description: "Ultima corsa tra 31 e 90 giorni fa.",
    push: "Campagna di riattivazione con corsa scontata o sblocco gratuito.",
  },
  persi: {
    label: "Persi",
    description: "Nessuna corsa da oltre 90 giorni.",
    push: "Comunicazione occasionale su novità (nuove zone, nuovi veicoli).",
  },
  mai_attivi: {
    label: "Mai una corsa",
    description: "Registrati su Atom ma senza nessuna corsa importata.",
    push: "Prima corsa gratis o sblocco gratuito per convertire l'iscrizione in utilizzo.",
  },
} as const;

export type Segment = keyof typeof SEGMENTS;

const SEGMENT_SQL = sql`
  with c as (
    select customer_atom_id as id,
      count(*)::int as rides_total,
      coalesce(sum(price), 0)::float as spend_total,
      count(*) filter (where start_time >= now() - interval '30 days')::int as rides_30,
      count(*) filter (where start_time >= now() - interval '60 days' and start_time < now() - interval '30 days')::int as rides_prev_30,
      coalesce(sum(price) filter (where start_time >= now() - interval '30 days'), 0)::float as spend_30,
      min(start_time) as first_ride,
      max(start_time) as last_ride,
      (array_agg(city_id order by start_time desc))[1] as city_id
    from rides where customer_atom_id is not null
    group by customer_atom_id
  )
  select c.*,
    case
      when first_ride >= now() - interval '30 days' then 'nuovi'
      when rides_prev_30 >= 4 and rides_30 * 2 < rides_prev_30 then 'in_calo'
      when rides_30 >= 4 then 'abituali'
      when rides_30 >= 1 then 'occasionali'
      when last_ride >= now() - interval '90 days' then 'dormienti'
      else 'persi'
    end as segment
  from c`;

const NEVER_RODE = sql`not exists (select 1 from rides r where r.customer_atom_id = cu.atom_id)`;

export async function segmentSummary(cityId?: number) {
  const rows = await db.execute<{ segment: Segment; customers: number; spend_30: number; spend_total: number }>(sql`
    select segment, count(*)::int as customers, sum(spend_30)::float as spend_30, sum(spend_total)::float as spend_total
    from (${SEGMENT_SQL}) s
    where ${cityId ? sql`city_id = ${cityId}` : sql`true`}
    group by segment`);
  // Chi non ha corse non ha una città: si conta solo nella vista di tutta la rete.
  if (!cityId) {
    const [never] = await db.execute<{ n: number }>(sql`select count(*)::int as n from customers cu where ${NEVER_RODE}`);
    rows.push({ segment: "mai_attivi", customers: never?.n ?? 0, spend_30: 0, spend_total: 0 });
  }
  return rows;
}

/** Utenti registrati importati da Atom (con o senza corse). */
export async function registeredCustomers(): Promise<number> {
  const [row] = await db.execute<{ n: number }>(sql`select count(*)::int as n from customers`);
  return row?.n ?? 0;
}

export async function customersInSegment(segment: Segment, cityId?: number, limit = 50) {
  if (segment === "mai_attivi") {
    if (cityId) return [];
    return db.execute<{
      id: number; name: string | null; email: string | null; phone: string | null;
      rides_total: number; spend_total: number; rides_30: number; rides_prev_30: number; last_ride: Date | null; city_name: string | null;
    }>(sql`
      select cu.atom_id as id, cu.name, cu.email, cu.phone, 0 as rides_total, 0::float as spend_total, 0 as rides_30, 0 as rides_prev_30,
             null as last_ride, null as city_name
      from customers cu where ${NEVER_RODE}
      order by cu.registered_at desc nulls last
      limit ${limit}`);
  }
  return db.execute<{
    id: number; name: string | null; email: string | null; phone: string | null;
    rides_total: number; spend_total: number; rides_30: number; rides_prev_30: number; last_ride: Date | null; city_name: string | null;
  }>(sql`
    select s.id, cu.name, cu.email, cu.phone, s.rides_total, s.spend_total, s.rides_30, s.rides_prev_30, s.last_ride, ci.name as city_name
    from (${SEGMENT_SQL}) s
    left join customers cu on cu.atom_id = s.id
    left join cities ci on ci.id = s.city_id
    where s.segment = ${segment} and ${cityId ? sql`s.city_id = ${cityId}` : sql`true`}
    order by s.spend_total desc
    limit ${limit}`);
}

/** Tutti i destinatari di un segmento (senza limite), per le notifiche push. */
export async function segmentRecipients(segment: Segment, cityId?: number) {
  if (segment === "mai_attivi") {
    if (cityId) return [];
    return db.execute<{ id: number; email: string | null; phone: string | null }>(sql`
      select cu.atom_id as id, cu.email, cu.phone from customers cu where ${NEVER_RODE}`);
  }
  return db.execute<{ id: number; email: string | null; phone: string | null }>(sql`
    select s.id, cu.email, cu.phone
    from (${SEGMENT_SQL}) s
    left join customers cu on cu.atom_id = s.id
    where s.segment = ${segment} and ${cityId ? sql`s.city_id = ${cityId}` : sql`true`}`);
}
