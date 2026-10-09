// Client in sola lettura per gli endpoint "Admin dashboard" di Atom.
// Doc: https://app.rideatom.com/api/docs

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

export class AtomClient {
  private token: string | null = null;
  private readonly baseUrl: string;

  constructor(private readonly account: AtomAccount) {
    this.baseUrl = (account.baseUrl ?? process.env.ATOM_BASE_URL ?? "https://app.rideatom.com").replace(/\/$/, "");
  }

  private async login() {
    const res = await fetch(`${this.baseUrl}/api/v2/admin/login/openapi`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: this.account.email, password: this.account.password }),
    });
    if (!res.ok) throw new Error(`Login Atom fallito (${res.status})`);
    const body = (await res.json()) as { access_token: string };
    this.token = body.access_token;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown, retry = true): Promise<T> {
    if (!this.token) await this.login();
    const scheme = process.env.ATOM_AUTH_SCHEME ?? "Bearer";
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: scheme ? `${scheme} ${this.token}` : this.token!,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401 && retry) {
      this.token = null;
      return this.request(method, path, body, false);
    }
    if (!res.ok) throw new Error(`Atom ${path} ha risposto ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
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

  /**
   * Corse concluse, dalla più recente, finché non si arriva prima di `since`.
   * Assume che Atom le ordini dalla più recente (da verificare sui dati reali).
   */
  async ridesSince(since: Date | null, maxPages = 200): Promise<AtomRide[]> {
    const out: AtomRide[] = [];
    let bookmark: string | null = null;
    for (let i = 0; i < maxPages; i++) {
      const res: { data: AtomRide[]; has_next_page: boolean; bookmark_next: string } = await this.request(
        "POST",
        "/api/v2/admin/rides",
        { ride_status: "ENDED", page_length: 100, page_bookmark: bookmark },
      );
      out.push(...res.data);
      const oldest = res.data.at(-1)?.start_time;
      if (!res.has_next_page || res.data.length === 0) break;
      if (since && oldest && new Date(oldest.replace(" ", "T")) < since) break;
      bookmark = res.bookmark_next;
    }
    return out;
  }

  async customers(maxPages = 500): Promise<AtomCustomer[]> {
    const out: AtomCustomer[] = [];
    let bookmark: string | null = null;
    for (let i = 0; i < maxPages; i++) {
      const res: { data: AtomCustomer[]; has_next_page: boolean; bookmark_next: string } = await this.request(
        "POST",
        "/api/v2/admin/users",
        { page_length: 100, bookmark_next: bookmark },
      );
      out.push(...res.data);
      if (!res.has_next_page || res.data.length === 0) break;
      bookmark = res.bookmark_next;
    }
    return out;
  }
}
