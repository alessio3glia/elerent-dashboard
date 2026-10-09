import "server-only";
import { AtomClient, atomAccountFromEnv } from "./client";
import { parseDate, parseNumber } from "./parse";

const PII = /name|email|phone|document|image|photo|card|token|password|qr|vin|imei|address/i;

/** Descrive la forma di un oggetto: per ogni campo il tipo e un esempio, senza dati personali. */
function shape(item: unknown): Record<string, string> {
  if (!item || typeof item !== "object") return {};
  return Object.fromEntries(
    Object.entries(item as Record<string, unknown>).map(([k, v]) => {
      const type = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
      if (PII.test(k)) return [k, `${type} <oscurato>`];
      const sample = typeof v === "object" && v !== null ? JSON.stringify(v).slice(0, 80) : String(v).slice(0, 40);
      return [k, `${type} · ${sample}`];
    }),
  );
}

async function timed<T>(fn: () => Promise<T>) {
  const t = Date.now();
  try {
    return { ok: true as const, ms: Date.now() - t, value: await fn() };
  } catch (e) {
    return { ok: false as const, ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
  }
}

type Page<T> = { data: T[]; has_next_page?: boolean; bookmark_next?: string; record_count?: number };

/** Prova le chiamate Atom usate dalla sync e riporta formati, ordinamento e stati veicolo. */
export async function diagnoseAtom() {
  const client = new AtomClient(atomAccountFromEnv());
  const report: Record<string, unknown> = {};

  const vehicles = await timed(() => client.request<Page<Record<string, unknown>>>("POST", "/api/v2/admin/vehicles", { page: 1, page_length: 100 }));
  report.autenticazione = vehicles.ok ? `ok, header: ${client.authScheme}` : vehicles.error;
  if (vehicles.ok) {
    const v = vehicles.value;
    report.veicoli = {
      ms: vehicles.ms,
      chiavi: Object.keys(v),
      record_count: v.record_count,
      has_next_page: v.has_next_page,
      stati: [...new Set(v.data.map((x) => String(x.status)))],
      campi: shape(v.data[0]),
    };
  }

  const rides = await timed(() =>
    client.request<Page<Record<string, unknown>>>("POST", "/api/v2/admin/rides", { ride_status: "ENDED", page_length: 50, page_bookmark: null }),
  );
  if (rides.ok) {
    const r = rides.value.data;
    const first = parseDate(r[0]?.start_time);
    const last = parseDate(r.at(-1)?.start_time);
    report.corse = {
      ms: rides.ms,
      chiavi: Object.keys(rides.value),
      ordine: first && last ? (first >= last ? "dalla più recente" : "dalla più vecchia") : "non determinato",
      bookmark: typeof rides.value.bookmark_next === "string" ? `stringa di ${rides.value.bookmark_next.length} caratteri` : String(rides.value.bookmark_next),
      formati: r.slice(0, 3).map((x) => ({
        start_time: x.start_time,
        letto_come: parseDate(x.start_time)?.toISOString() ?? "NON LETTO",
        price: x.price,
        prezzo_letto: parseNumber(x.price),
        kilometers: x.kilometers,
        time: x.time,
        paid_with_subscription: x.paid_with_subscription,
      })),
      campi: shape(r[0]),
    };
  } else report.corse = rides.error;

  const users = await timed(() => client.request<Page<Record<string, unknown>>>("POST", "/api/v2/admin/users", { page_length: 20 }));
  report.clienti = users.ok
    ? { ms: users.ms, chiavi: Object.keys(users.value), formato_data: users.value.data[0]?.date, campi: shape(users.value.data[0]) }
    : users.error;

  return report;
}
