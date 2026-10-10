import "server-only";
import { eq, sql } from "drizzle-orm";
import type { AtomClient } from "@/lib/atom/client";
import { parseDate, parseNumber } from "@/lib/atom/parse";
import { db, schema } from "@/lib/db";
import { toId } from "./map";

const { subscriptions, syncState } = schema;

const HISTORY = "/api/v2/admin/subscriptions/history";
const PLANS = "/api/v2/admin/subscriptions";
const STATE_KEY = "subscriptions";
const PII = /name|email|phone|document|image|photo|card|token|password|address/i;

type Row = Record<string, unknown>;
type Page = { data?: Row[]; has_next_page?: boolean; bookmark_next?: string | null };

/**
 * Il formato della richiesta non è documentato: si prova la paginazione a segnalibro (come le corse)
 * e quella a numero di pagina. La prima che Atom accetta si ricorda nello stato.
 */
const MODES = {
  bookmark: (cursor: string | null) => ({ page_length: 100, page_bookmark: cursor }),
  page: (cursor: string | null) => ({ page: Number(cursor ?? 1), page_length: 100 }),
} as const;
type Mode = keyof typeof MODES;

export type SubscriptionsState = {
  mode?: Mode;
  cursor?: string | null;
  /** Primo giro completo dello storico finito. */
  done?: boolean;
  pages?: number;
  saved?: number;
  lastError?: string | null;
  at?: string;
};

const first = (o: Row, keys: string[]) => {
  for (const k of keys) {
    const path = k.split(".");
    let v: unknown = o;
    for (const p of path) v = v && typeof v === "object" ? (v as Row)[p] : undefined;
    if (v !== undefined && v !== null && v !== "" && v !== "-") return v;
  }
  return undefined;
};

/** Legge un acquisto di abbonamento qualunque siano i nomi dei campi usati da Atom. */
export function mapSubscription(o: Row, plans: Map<string, Row>) {
  const id = first(o, ["id", "history_id", "subscription_history_id", "uuid"]);
  if (id === undefined) return null;
  const planId = first(o, ["subscription_id", "subscription.id", "plan_id"]);
  const plan = planId !== undefined ? plans.get(String(planId)) : undefined;
  const placeKeys = ["city", "city_name", "region", "region_name", "zone", "zone_name", "area", "area_name", "service_area", "location_name"];
  const place = first(o, placeKeys) ?? (plan ? first(plan, placeKeys) : undefined);
  const raw = Object.fromEntries(Object.entries(o).filter(([k]) => !PII.test(k) || k === "subscription_name"));
  return {
    atomId: String(id),
    customerAtomId: toId(first(o, ["user_id", "customer_id", "user.id", "customer.id"])),
    name: (first(o, ["subscription_name", "subscription.name", "title", "plan_name", "name"]) ?? (plan ? first(plan, ["name", "title"]) : undefined)) as string | undefined ?? null,
    price: parseNumber(first(o, ["price", "amount", "cost", "paid", "total", "total_price", "sum"]) ?? (plan ? first(plan, ["price", "amount", "cost"]) : undefined)),
    purchasedAt: parseDate(first(o, ["purchase_date", "purchased_at", "bought_at", "created_at", "created", "date", "start_date", "history_start_date", "valid_from"])),
    endsAt: parseDate(first(o, ["end_date", "expiration_date", "expires_at", "valid_until", "valid_to", "history_end_date"])),
    status: (first(o, ["status", "state"]) as string | undefined) ?? null,
    place: typeof place === "string" ? place : place !== undefined ? JSON.stringify(place).slice(0, 80) : null,
    raw,
  };
}

async function readState(): Promise<SubscriptionsState> {
  const [row] = await db.select().from(syncState).where(eq(syncState.key, STATE_KEY));
  return (row?.value as SubscriptionsState) ?? {};
}

async function writeState(value: SubscriptionsState) {
  await db
    .insert(syncState)
    .values({ key: STATE_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: syncState.key, set: { value, updatedAt: new Date() } });
}

export const getSubscriptionsState = readState;

async function plansById(client: AtomClient) {
  try {
    const res = await client.request<Page>("POST", PLANS, { page: 1, page_length: 100 });
    return new Map((res.data ?? []).map((p) => [String(p.id), p]));
  } catch {
    return new Map<string, Row>();
  }
}

async function fetchPage(client: AtomClient, mode: Mode, cursor: string | null) {
  const res = await client.request<Page>("POST", HISTORY, MODES[mode](cursor));
  const data = res.data ?? [];
  const next = mode === "page" ? (res.has_next_page && data.length ? String(Number(cursor ?? 1) + 1) : null) : res.has_next_page && data.length ? (res.bookmark_next ?? null) : null;
  return { data, next };
}

async function detectMode(client: AtomClient): Promise<Mode> {
  for (const mode of Object.keys(MODES) as Mode[]) {
    try {
      await fetchPage(client, mode, null);
      return mode;
    } catch {
      // formato rifiutato: si prova il successivo
    }
  }
  throw new Error("Atom non accetta nessun formato di richiesta per lo storico abbonamenti (vedi Diagnostica)");
}

async function save(rows: Row[], plans: Map<string, Row>) {
  const mapped = [...new Map(rows.map((r) => mapSubscription(r, plans)).filter((r) => r !== null).map((r) => [r.atomId, r])).values()];
  if (!mapped.length) return { saved: 0, fresh: 0 };
  const existing = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from subscriptions where atom_id in (${sql.join(mapped.map((r) => sql`${r.atomId}`), sql`, `)})`,
  );
  const now = new Date();
  await db
    .insert(subscriptions)
    .values(mapped.map((r) => ({ ...r, updatedAt: now })))
    .onConflictDoUpdate({
      target: subscriptions.atomId,
      set: {
        customerAtomId: sql.raw("excluded.customer_atom_id"),
        name: sql.raw("excluded.name"),
        price: sql.raw("excluded.price"),
        purchasedAt: sql.raw("excluded.purchased_at"),
        endsAt: sql.raw("excluded.ends_at"),
        status: sql.raw("excluded.status"),
        place: sql.raw("excluded.place"),
        raw: sql.raw("excluded.raw"),
        updatedAt: sql.raw("excluded.updated_at"),
      },
    });
  return { saved: mapped.length, fresh: mapped.length - (existing[0]?.n ?? 0) };
}

/**
 * Città dell'acquisto: quella scritta da Atom se corrisponde a una nostra città,
 * altrimenti la città della corsa dell'utente più vicina nel tempo all'acquisto.
 */
export async function assignSubscriptionCities() {
  await db.execute(sql`
    update subscriptions s set city_id = c.id
    from cities c
    where s.city_id is null and s.place is not null
      and (lower(c.name) = lower(s.place) or lower(s.place) like lower(c.name) || '%')`);
  await db.execute(sql`
    update subscriptions s set city_id = (
      select r.city_id from rides r
      where r.customer_atom_id = s.customer_atom_id and r.city_id is not null
      order by abs(extract(epoch from r.start_time - coalesce(s.purchased_at, now())))
      limit 1
    )
    where s.city_id is null and s.customer_atom_id is not null`);
}

/**
 * Scarica lo storico abbonamenti. Il primo giro legge tutto, a blocchi fino a `deadline` (riprende da dove era);
 * poi ogni volta rilegge solo le prime pagine, dove arrivano gli acquisti nuovi.
 */
export async function syncSubscriptions(client: AtomClient, deadline = Date.now() + 30_000) {
  const state = await readState();
  const next: SubscriptionsState = { ...state, at: new Date().toISOString(), lastError: null };
  try {
    next.mode ??= await detectMode(client);
    const plans = await plansById(client);
    let cursor = state.done ? null : (state.cursor ?? null);
    let fresh = 0;
    for (let i = 0; Date.now() < deadline; i++) {
      const page = await fetchPage(client, next.mode, cursor);
      const result = await save(page.data, plans);
      fresh += result.fresh;
      next.saved = (next.saved ?? 0) + result.fresh;
      next.pages = (next.pages ?? 0) + 1;
      // Segnalibro ignorato da Atom (torna sempre la stessa pagina): lo storico finisce qui.
      cursor = page.next && page.next !== cursor ? page.next : null;
      // Dopo il primo giro bastano le pagine con acquisti nuovi.
      if (!cursor || (state.done && (result.fresh === 0 || i >= 4))) break;
    }
    if (!state.done) {
      next.cursor = cursor;
      next.done = cursor === null;
    }
    await assignSubscriptionCities();
    await writeState(next);
    return { fresh, done: next.done };
  } catch (error) {
    next.lastError = error instanceof Error ? error.message.slice(0, 300) : String(error);
    await writeState(next);
    throw error;
  }
}

/** Riparte dall'inizio dello storico (es. una volta al giorno, se Atom non ordina dal più recente). */
export async function rescanSubscriptions() {
  const state = await readState();
  if (state.done) await writeState({ ...state, done: false, cursor: null });
}
