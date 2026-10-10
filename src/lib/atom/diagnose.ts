import "server-only";
import { AtomClient, DATE_RANGE_SHAPES, atomAccountFromEnv } from "./client";
import { addDays, localDay } from "@/lib/dates";
import { isOnStreet, parseDate, parseNumber } from "./parse";

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
    const value = await fn();
    return { ok: true as const, ms: Date.now() - t, value };
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
      in_strada: v.data.filter((x) => isOnStreet(x.status as string)).length,
      campi: shape(v.data[0]),
    };
  }

  // Abbonamenti: piani e storico acquisti (formato non documentato, si mostrano i campi).
  for (const [key, path] of [["abbonamenti_piani", "/api/v2/admin/subscriptions"], ["abbonamenti_acquisti", "/api/v2/admin/subscriptions/history"]] as const) {
    const tries: Record<string, unknown> = {};
    for (const [mode, body] of [["segnalibro", { page_length: 20, page_bookmark: null }], ["pagina", { page: 1, page_length: 20 }]] as const) {
      const res = await timed(() => client.request<Page<Record<string, unknown>>>("POST", path, body));
      tries[mode] = res.ok
        ? { ms: res.ms, chiavi: Object.keys(res.value), righe: res.value.data?.length ?? 0, has_next_page: res.value.has_next_page, campi: shape(res.value.data?.[0]) }
        : res.error;
      if (res.ok) break;
    }
    report[key] = tries;
  }

  const rides = await timed(() =>
    client.request<Page<Record<string, unknown>>>("POST", "/api/v2/admin/rides", { ride_status: "ENDED", page_length: 50, page_bookmark: null }),
  );
  if (rides.ok) {
    const r = rides.value.data;
    const first = parseDate(r[0]?.history_start_date ?? r[0]?.start_time);
    const last = parseDate(r.at(-1)?.history_start_date ?? r.at(-1)?.start_time);
    report.corse = {
      ms: rides.ms,
      chiavi: Object.keys(rides.value),
      ordine: first && last ? (first >= last ? "dalla più recente" : "dalla più vecchia") : "non determinato",
      bookmark: typeof rides.value.bookmark_next === "string" ? `stringa di ${rides.value.bookmark_next.length} caratteri` : String(rides.value.bookmark_next),
      formati: r.slice(0, 3).map((x) => ({
        start_time: x.start_time,
        letto_come: parseDate(x.start_time)?.toISOString() ?? "NON LETTO",
        epoch_come: parseDate(x.history_start_date)?.toISOString() ?? "-",
        price: x.price,
        prezzo_letto: parseNumber(x.price),
        kilometers: x.kilometers,
        time: x.time,
        paid_with_subscription: x.paid_with_subscription,
      })),
      campi: shape(r[0]),
    };
  } else report.corse = rides.error;

  // Filtro per data delle corse: lo schema non è documentato, quindi si mostra cosa risponde Atom a ogni forma.
  const probeEnd = addDays(localDay(), -70);
  const probeFrom = addDays(probeEnd, -6);
  const dateRange: Record<string, unknown> = { settimana_chiesta: `${probeFrom} → ${probeEnd}` };
  const candidates: [string, unknown][] = [["oggetto vuoto {}", {}], ...Object.entries(DATE_RANGE_SHAPES).map(([k, f]) => [k, f(probeFrom, probeEnd)] as [string, unknown])];
  for (const [name, range] of candidates) {
    const res = await timed(() =>
      client.request<Page<Record<string, unknown>>>("POST", "/api/v2/admin/rides", { ride_status: "ENDED", page_length: 20, page_bookmark: null, date_range: range }),
    );
    if (!res.ok) {
      dateRange[name] = res.error.slice(0, 400);
      continue;
    }
    const days = res.value.data.map((x) => parseDate(x.history_start_date ?? x.start_time)?.toISOString().slice(0, 10)).filter(Boolean).sort();
    dateRange[name] = days.length ? `${days.length} corse dal ${days[0]} al ${days.at(-1)}` : "0 corse";
  }
  report.filtro_date_corse = dateRange;

  const users = await timed(() => client.request<Page<Record<string, unknown>>>("POST", "/api/v2/admin/users", { page_length: 20 }));
  // Paginazione utenti: quale campo fa davvero passare alla pagina successiva.
  if (users.ok) {
    const field = await timed(() => client.detectUsersPaging());
    report.clienti_paginazione = field.ok ? (field.value ? `funziona con "${field.value}"` : "nessun campo porta alla pagina 2") : field.error;
  }

  report.clienti = users.ok
    ? { ms: users.ms, chiavi: Object.keys(users.value), formato_data: users.value.data[0]?.date, campi: shape(users.value.data[0]) }
    : users.error;

  return report;
}
