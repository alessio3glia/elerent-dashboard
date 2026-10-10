// Client in sola lettura per gli endpoint "Admin dashboard" di Atom.
// Doc: https://app.rideatom.com/api/docs

import { parseDate } from "./parse";

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
const BACKOFF_MS = [2_000, 5_000, 15_000, 30_000];

/**
 * fetch con timeout e nuovi tentativi sugli errori temporanei (rete, 429, 5xx),
 * così una pagina lenta o un limite di richieste non ferma l'import.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(45_000) });
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
  async ridesPage(bookmark: string | null) {
    const res = await this.request<{ data: AtomRide[]; has_next_page: boolean; bookmark_next: string }>(
      "POST",
      "/api/v2/admin/rides",
      { ride_status: "ENDED", page_length: 100, page_bookmark: bookmark },
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

  /** Una pagina di clienti; `bookmark` null = la prima. */
  async customersPage(bookmark: string | null) {
    const res = await this.request<{ data: AtomCustomer[]; has_next_page: boolean; bookmark_next: string }>(
      "POST",
      "/api/v2/admin/users",
      { page_length: 100, bookmark_next: bookmark },
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
