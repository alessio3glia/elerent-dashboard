// Client in sola lettura per gli endpoint "Admin dashboard" di Atom.
// Doc: https://app.rideatom.com/api/docs

import { parseDate } from "./parse";

/** Forme possibili dell'oggetto date_range di Atom (lo schema non è documentato): si prova quale funziona. */
export const DATE_RANGE_SHAPES: Record<string, (from: string, to: string) => unknown> = {
  "from/to giorno": (from, to) => ({ from, to }),
  "from/to data e ora": (from, to) => ({ from: `${from}T00:00:00`, to: `${to}T23:59:59` }),
  "from/to gg/mm/aaaa": (from, to) => ({ from: itDate(from), to: itDate(to) }),
  "start_date/end_date": (from, to) => ({ start_date: from, end_date: to }),
  "start/end": (from, to) => ({ start: from, end: to }),
  "date_from/date_to": (from, to) => ({ date_from: from, date_to: to }),
  "from/to unix": (from, to) => ({ from: unix(from), to: unix(to) + 86_399 }),
};

const itDate = (day: string) => day.split("-").reverse().join("/");
const unix = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);

export type AtomAccount = { email: string; password: string; baseUrl?: string };

export type AtomRide = {
  id: number;
  start_time: string;
  end_time: string | null;
  vehicle_id: number | null;
  vehicle_number?: string;
  kilometers?: string;
  time?: string;
  price?: string;
  charged_balance?: string;
  charged_bonus?: string;
  user_id: number | null;
  paid_with_subscription?: string;
  user_end_location?: { latitude: number; longitude: number } | null;
  end_location?: { latitude: number; longitude: number } | null;
  /** Inizio e fine corsa in secondi Unix: più affidabili delle stringhe formattate. */
  history_start_date?: number | null;
  history_end_date?: number | null;
};

export type AtomVehicle = {
  id: number;
  vehicle_number?: string;
  vehicle_battery?: number | string;
  coordinates?: { latitude: number; longitude: number } | null;
  total_rides?: number;
  status?: string;
  last_park_date?: string | null;
};

export type AtomCustomer = {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  date?: string;
  wallet?: number;
  debt?: number;
  rides?: number;
  blocked?: boolean;
};

/** L'account admin Atom che vede tutte le città. Credenziali solo da variabili d'ambiente. */
export function atomAccountFromEnv(): AtomAccount {
  const email = process.env.ATOM_EMAIL;
  const password = process.env.ATOM_PASSWORD;
  if (!email || !password) throw new Error("ATOM_EMAIL e ATOM_PASSWORD non impostate");
  return { email, password };
}

const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);
const BACKOFF_MS = [2_000, 5_000, 10_000];

/**
 * fetch con timeout e nuovi tentativi sugli errori temporanei (rete, 429, 5xx),
 * così una pagina lenta o un limite di richieste non ferma l'import.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
      if (!TRANSIENT.has(res.status) || attempt >= BACKOFF_MS.length) return res;
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : BACKOFF_MS[attempt]);
    } catch (error) {
      if (attempt >= BACKOFF_MS.length) throw error;
      await sleep(BACKOFF_MS[attempt]);
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class AtomClient {
  private token: string | null = null;
  private readonly baseUrl: string;

  constructor(private readonly account: AtomAccount) {
    this.baseUrl = (account.baseUrl ?? process.env.ATOM_BASE_URL ?? "https://app.rideatom.com").replace(/\/$/, "");
  }

  private async login() {
    const res = await fetchWithRetry(`${this.baseUrl}/api/v2/admin/login/openapi`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: this.account.email, password: this.account.password }),
    });
    if (!res.ok) throw new Error(`Login Atom fallito (${res.status})`);
    const body = (await res.json()) as { access_token: string };
    this.token = body.access_token;
  }

  /** Schema dell'header Authorization: "Bearer <token>" oppure il token da solo. Scoperto al primo 401. */
  private scheme: string | null = process.env.ATOM_AUTH_SCHEME ?? "Bearer";
  private schemeVerified = false;

  async request<T>(method: "GET" | "POST", path: string, body?: unknown, attempt = 0): Promise<T> {
    if (!this.token) await this.login();
    const res = await fetchWithRetry(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: this.scheme ? `${this.scheme} ${this.token}` : this.token!,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401 && attempt === 0 && !this.schemeVerified) {
      this.scheme = this.scheme ? null : "Bearer";
      return this.request(method, path, body, 1);
    }
    if (res.status === 401 && attempt <= 1) {
      this.token = null;
      return this.request(method, path, body, 2);
    }
    if (!res.ok) throw new Error(`Atom ${path} ha risposto ${res.status}: ${(await res.text()).slice(0, 200)}`);
    this.schemeVerified = true;
    return (await res.json()) as T;
  }

  get authScheme() {
    return this.scheme ?? "(solo token)";
  }

  /** Tutti i veicoli della flotta (paginazione per numero di pagina). */
  async vehicles(): Promise<AtomVehicle[]> {
    const out: AtomVehicle[] = [];
    for (let page = 1; page <= 500; page++) {
      const res = await this.request<{ data: AtomVehicle[]; has_next_page: boolean }>("POST", "/api/v2/admin/vehicles", {
        page,
        page_length: 100,
      });
      out.push(...res.data);
      if (!res.has_next_page || res.data.length === 0) break;
    }
    return out;
  }

  /** Una pagina di corse concluse; `bookmark` null = la prima. */
  async ridesPage(bookmark: string | null, dateRange?: unknown) {
    const res = await this.request<{ data: AtomRide[]; has_next_page: boolean; bookmark_next: string }>(
      "POST",
      "/api/v2/admin/rides",
      { ride_status: "ENDED", page_length: 100, page_bookmark: bookmark, ...(dateRange ? { date_range: dateRange } : {}) },
    );
    return { rides: res.data, next: res.has_next_page && res.data.length > 0 ? res.bookmark_next : null };
  }

  /**
   * Corse concluse, dalla più recente, finché non si arriva prima di `since`.
   * Assume che Atom le ordini dalla più recente (verificabile da Impostazioni → Diagnostica).
   */
  async ridesSince(since: Date, maxPages = 200): Promise<AtomRide[]> {
    const out: AtomRide[] = [];
    let bookmark: string | null = null;
    for (let i = 0; i < maxPages; i++) {
      const page = await this.ridesPage(bookmark);
      out.push(...page.rides);
      const last = page.rides.at(-1);
      const oldest = parseDate(last?.history_start_date ?? last?.start_time);
      if (!page.next || (oldest && oldest < since)) break;
      bookmark = page.next;
    }
    return out;
  }

  /**
   * Trova la forma di date_range che Atom accetta davvero: chiede le corse di una settimana di
   * qualche mese fa e controlla che le corse restituite cadano in quella settimana
   * (se il filtro viene ignorato arrivano le corse recenti). Null se nessuna forma funziona.
   */
  async detectDateRangeShape(from: string, to: string): Promise<string | null> {
    const lo = Date.parse(`${from}T00:00:00Z`) - 2 * 86_400_000;
    const hi = Date.parse(`${to}T23:59:59Z`) + 2 * 86_400_000;
    for (const [name, build] of Object.entries(DATE_RANGE_SHAPES)) {
      try {
        const page = await this.ridesPage(null, build(from, to));
        const times = page.rides.map((r) => parseDate(r.history_start_date ?? r.start_time)?.getTime()).filter((t): t is number => !!t);
        // Accettata da Atom (nessun 400) e, se ci sono corse, tutte nella settimana chiesta.
        if (times.length === 0 || times.filter((t) => t >= lo && t <= hi).length >= times.length * 0.9) return name;
      } catch {
        // forma rifiutata da Atom: si prova la successiva
      }
    }
    return null;
  }

  /**
   * Come Atom vuole il segnalibro della pagina utenti. Con `bookmark_next` restituisce sempre la prima
   * pagina (verificato da Diagnostica), quindi si prova anche `page_bookmark` come per le corse.
   */
  private usersBookmarkField: string | null = null;

  async detectUsersPaging(): Promise<string | null> {
    const first = await this.request<{ data: AtomCustomer[]; bookmark_next: string }>("POST", "/api/v2/admin/users", { page_length: 20 });
    const seen = new Set(first.data.map((u) => u.id));
    for (const field of ["page_bookmark", "bookmark", "bookmark_next"]) {
      try {
        const next = await this.request<{ data: AtomCustomer[] }>("POST", "/api/v2/admin/users", { page_length: 20, [field]: first.bookmark_next });
        if (next.data.length && next.data.some((u) => !seen.has(u.id))) return (this.usersBookmarkField = field);
      } catch {
        // campo rifiutato: si prova il successivo
      }
    }
    return null;
  }

  /** Una pagina di clienti; `bookmark` null = la prima. */
  async customersPage(bookmark: string | null, field = this.usersBookmarkField ?? "page_bookmark") {
    const res = await this.request<{ data: AtomCustomer[]; has_next_page: boolean; bookmark_next: string }>(
      "POST",
      "/api/v2/admin/users",
      { page_length: 100, ...(bookmark ? { [field]: bookmark } : {}) },
    );
    return { customers: res.data, next: res.has_next_page && res.data.length > 0 ? res.bookmark_next : null };
  }

  /** Clienti pagina per pagina, fermandosi alla scadenza `deadline` (timestamp ms) per stare nei limiti di Vercel. */
  async customers(deadline = Date.now() + 120_000): Promise<AtomCustomer[]> {
    const out: AtomCustomer[] = [];
    let bookmark: string | null = null;
    while (Date.now() < deadline) {
      const page = await this.customersPage(bookmark);
      out.push(...page.customers);
      if (!page.next) break;
      bookmark = page.next;
    }
    return out;
  }

}
