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

/**
 * Il formato della richiesta non è documentato: si prova la paginazione a segnalibro (come le corse),
 * con e senza intervallo di date, e quella a numero di pagina. Vince la prima che restituisce acquisti.
 */
const HISTORY_FROM = "2024-01-01";
const today = () => new Date().toISOString().slice(0, 10);
const MODES = {
  bookmark: (cursor: string | null) => ({ page_length: 100, page_bookmark: cursor }),
  bookmark_date: (cursor: string | null) => ({ page_length: 100, page_bookmark: cursor, date_range: { from: HISTORY_FROM, to: today() } }),
  page: (cursor: string | null) => ({ page: Number(cursor ?? 1), page_length: 100 }),
  page_date: (cursor: string | null) => ({ page: Number(cursor ?? 1), page_length: 100, date_range: { from: HISTORY_FROM, to: today() } }),
} as const;
type Mode = keyof typeof MODES;

/** Cosa ha risposto Atom all'ultima prova, mostrato nella pagina Abbonamenti se non arriva niente. */
type Probe = { endpoint: string; mode: string; result: string };

type SourceState = { mode?: Mode; cursor?: string | null; done?: boolean };

/** Storico a finestre di date (Atom senza filtro restituisce solo gli acquisti recenti, come per le corse). */
type HistoryState = { windowEnd?: string; cursor?: string | null; done?: boolean; windows?: number; error?: string | null };

export type SubscriptionsState = {
  history?: HistoryState;
  /** Stato per endpoint: acquisti attivi e storico acquisti. */
  sources?: Record<string, SourceState>;
  /** Primo giro completo di tutte le fonti finito. */
  done?: boolean;
  pages?: number;
  saved?: number;
  lastError?: string | null;
  probes?: Probe[];
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

/** Le righe della risposta, qualunque sia la chiave usata da Atom (data, items, results...). */
function rowsOf(res: unknown): Row[] {
  if (Array.isArray(res)) return res.filter((x) => x && typeof x === "object") as Row[];
  if (!res || typeof res !== "object") return [];
  const o = res as Row;
  for (const key of ["data", "items", "results", "subscriptions", "history", "list", "records", "rows"]) {
    const v = o[key];
    if (Array.isArray(v)) return v as Row[];
    if (v && typeof v === "object") {
      const inner = rowsOf(v);
      if (inner.length) return inner;
    }
  }
  return [];
}

/** Un acquisto ha sempre un utente; le righe senza utente sono i piani (tipi di abbonamento). */
const hasUser = (r: Row) => first(r, ["user_id", "customer_id", "user.id", "customer.id"]) !== undefined;

async function fetchPage(client: AtomClient, path: string, mode: Mode, cursor: string | null) {
  const res = await client.request<Row>("POST", path, MODES[mode](cursor));
  const data = rowsOf(res);
  const more = (res.has_next_page ?? res.has_next ?? res.next_page) && data.length > 0;
  const bookmark = (res.bookmark_next ?? res.next_bookmark ?? res.page_bookmark) as string | null | undefined;
  const next = mode.startsWith("page") ? (more ? String(Number(cursor ?? 1) + 1) : null) : more ? (bookmark ?? null) : null;
  return { data, next, keys: Object.keys(res ?? {}) };
}

/** Prova i formati di richiesta e tiene il primo che porta acquisti; annota cosa ha risposto Atom. */
async function detectMode(client: AtomClient, path: string, probes: Probe[]): Promise<Mode | null> {
  let accepted: Mode | null = null;
  for (const mode of Object.keys(MODES) as Mode[]) {
    try {
      const page = await fetchPage(client, path, mode, null);
      const purchases = page.data.filter(hasUser).length;
      probes.push({
        endpoint: path,
        mode,
        result: `ok · chiavi ${page.keys.join(", ") || "-"} · ${page.data.length} righe (${purchases} con utente) · campi ${Object.keys(page.data[0] ?? {}).join(", ") || "-"}`,
      });
      if (purchases > 0) return mode;
      accepted ??= mode;
    } catch (error) {
      probes.push({ endpoint: path, mode, result: (error instanceof Error ? error.message : String(error)).slice(0, 200) });
    }
  }
  return accepted;
}

async function save(rows: Row[], plans: Map<string, Row>) {
  const mapped = [...new Map(rows.filter(hasUser).map((r) => mapSubscription(r, plans)).filter((r) => r !== null).map((r) => [r.atomId, r])).values()];
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

const SOURCES = [HISTORY, PLANS];

/**
 * Scarica gli abbonamenti acquistati da entrambi gli elenchi Atom (attivi e storico). Il primo giro legge tutto,
 * a blocchi fino a `deadline` (riprende da dove era); poi ogni volta rilegge solo le prime pagine, dove arrivano i nuovi.
 */
export async function syncSubscriptions(client: AtomClient, deadline = Date.now() + 30_000) {
  const state = await readState();
  const next: SubscriptionsState = { ...state, sources: { ...state.sources }, at: new Date().toISOString(), lastError: null };
  const probes: Probe[] = [];
  let fresh = 0;
  try {
    // I piani (righe senza utente) danno nome e prezzo agli acquisti che hanno solo l'id del piano.
    const plans = new Map<string, Row>();
    try {
      for (const p of rowsOf(await client.request<Row>("POST", PLANS, { page: 1, page_length: 100 }))) if (!hasUser(p)) plans.set(String(p.id), p);
    } catch {
      // nessun elenco piani: si usano i campi dell'acquisto
    }
    for (const path of SOURCES) {
      const src: SourceState = { ...next.sources![path] };
      // Finché non è arrivato nessun acquisto si riprova a capire il formato a ogni giro.
      if (!src.mode || !(next.saved ?? 0)) {
        src.mode = (await detectMode(client, path, probes)) ?? undefined;
        if (!src.mode) {
          next.sources![path] = src;
          continue;
        }
      }
      let cursor = src.done ? null : (src.cursor ?? null);
      let gotAny = false;
      for (let i = 0; Date.now() < deadline; i++) {
        const page = await fetchPage(client, path, src.mode, cursor);
        const result = await save(page.data, plans);
        gotAny ||= result.saved > 0;
        fresh += result.fresh;
        next.saved = (next.saved ?? 0) + result.fresh;
        next.pages = (next.pages ?? 0) + 1;
        // Segnalibro ignorato da Atom (torna sempre la stessa pagina): l'elenco finisce qui.
        cursor = page.next && page.next !== cursor ? page.next : null;
        // Dopo il primo giro bastano le pagine con acquisti nuovi.
        if (!cursor || (src.done && (result.fresh === 0 || i >= 4))) break;
      }
      if (!src.done) {
        src.cursor = cursor;
        // Un elenco senza nessun acquisto non si considera finito: si riprova al giro dopo.
        src.done = cursor === null && (gotAny || (next.saved ?? 0) > 0);
      }
      next.sources![path] = src;
    }
    // Storico completo: finestre di 14 giorni all'indietro fino all'inizio, con il filtro date delle corse.
    const histMode = next.sources![HISTORY]?.mode;
    if (histMode && !next.history?.done && Date.now() < deadline) {
      const result = await historyWindows(client, histMode, { ...next.history }, plans, deadline);
      next.history = result.state;
      fresh += result.fresh;
      next.saved = (next.saved ?? 0) + result.fresh;
      next.pages = (next.pages ?? 0) + result.pages;
    }
    next.done = SOURCES.every((p) => next.sources![p]?.done) && !!next.history?.done;
    if (probes.length) next.probes = probes;
    if (!(next.saved ?? 0) && !next.probes?.length) next.lastError = "Atom non ha restituito nessun acquisto";
    await assignSubscriptionCities();
    await writeState(next);
    return { fresh, done: next.done };
  } catch (error) {
    next.lastError = error instanceof Error ? error.message.slice(0, 300) : String(error);
    if (probes.length) next.probes = probes;
    await writeState(next);
    throw error;
  }
}

const HISTORY_START = () => process.env.ATOM_HISTORY_START ?? "2024-01-01";
const WINDOW_DAYS = 14;
const shiftDay = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Scarica lo storico una finestra di date alla volta, dalla più recente, riprendendo da dove era arrivato. */
async function historyWindows(client: AtomClient, mode: Mode, h: HistoryState, plans: Map<string, Row>, deadline: number) {
  let fresh = 0;
  let pages = 0;
  h.windowEnd ??= today();
  while (Date.now() < deadline && !h.done) {
    if (h.windowEnd < HISTORY_START()) {
      h.done = true;
      break;
    }
    const from = shiftDay(h.windowEnd, -(WINDOW_DAYS - 1));
    const range = { from, to: h.windowEnd };
    const body = mode.startsWith("page")
      ? { page: Number(h.cursor ?? 1), page_length: 100, date_range: range }
      : { page_length: 100, page_bookmark: h.cursor ?? null, date_range: range };
    let res: Row;
    try {
      res = await client.request<Row>("POST", HISTORY, body);
    } catch (error) {
      // Filtro per date rifiutato: lo storico resta quello che Atom dà senza filtro.
      h.error = `filtro date rifiutato: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`;
      h.done = true;
      break;
    }
    pages++;
    const data = rowsOf(res);
    // Se Atom ignora il filtro arrivano sempre gli acquisti recenti: ci si ferma invece di girare a vuoto.
    const dates = data.map((r) => mapSubscription(r, plans)?.purchasedAt?.getTime()).filter((t): t is number => !!t);
    const lo = Date.parse(`${from}T00:00:00Z`) - 2 * 86_400_000;
    const hi = Date.parse(`${h.windowEnd}T23:59:59Z`) + 2 * 86_400_000;
    if (dates.length && dates.filter((t) => t >= lo && t <= hi).length < dates.length * 0.5) {
      h.error = "Atom ignora il filtro per date sugli abbonamenti";
      h.done = true;
      break;
    }
    fresh += (await save(data, plans)).fresh;
    const more = (res.has_next_page ?? res.has_next) && data.length > 0;
    const bookmark = (res.bookmark_next ?? res.next_bookmark) as string | null | undefined;
    const nextCursor = more ? (mode.startsWith("page") ? String(Number(h.cursor ?? 1) + 1) : (bookmark ?? null)) : null;
    if (nextCursor && nextCursor !== h.cursor) {
      h.cursor = nextCursor;
    } else {
      h.cursor = null;
      h.windowEnd = shiftDay(from, -1);
      h.windows = (h.windows ?? 0) + 1;
    }
  }
  return { state: h, fresh, pages };
}

/** Riparte dall'inizio dello storico (una volta al giorno, se Atom non ordina dal più recente). */
export async function rescanSubscriptions() {
  const state = await readState();
  const sources = Object.fromEntries(Object.entries(state.sources ?? {}).map(([k, v]) => [k, { ...v, done: false, cursor: null }]));
  await writeState({ ...state, done: false, sources });
}
