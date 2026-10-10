import { eq, max, sql } from "drizzle-orm";
import { AtomClient, DATE_RANGE_SHAPES, atomAccountFromEnv, type AtomRide } from "@/lib/atom/client";
import { db, schema } from "@/lib/db";
import { addDays, localDay } from "@/lib/dates";
import { cityForPoint, distanceKm, type CityArea } from "@/lib/geo";
import { ITALIAN_CITIES } from "@/lib/italian-cities";
import { mapCustomer, mapRide, mapVehicle } from "./map";

const { cities, vehicles, vehicleSnapshots, rides, customers, syncRuns, syncState } = schema;

function chunks<T>(items: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const excluded = (col: string) => sql.raw(`excluded.${col}`);

const activeAreas = () => db.select().from(cities).where(eq(cities.active, true));

const AREA_RADIUS_KM = 15;

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Crea in automatico le città per i veicoli che non cadono in nessuna area esistente:
 * raggruppa i veicoli vicini e dà all'area il nome del comune più vicino.
 * Le città create si possono rinominare e regolare da Impostazioni.
 */
export async function createMissingCities(points: { lat: number; lng: number }[], areas: CityArea[]) {
  const all = await db.select().from(cities);
  const orphans = points.filter((p) => cityForPoint(p, areas) === null && cityForPoint(p, all) === null);
  const created: string[] = [];
  const clusters: { lat: number; lng: number; n: number }[] = [];
  for (const p of orphans) {
    const c = clusters.find((c) => distanceKm(p, c) <= AREA_RADIUS_KM);
    if (c) {
      c.lat = (c.lat * c.n + p.lat) / (c.n + 1);
      c.lng = (c.lng * c.n + p.lng) / (c.n + 1);
      c.n++;
    } else clusters.push({ ...p, n: 1 });
  }
  for (const c of clusters.filter((c) => c.n >= 3)) {
    const nearest = ITALIAN_CITIES.map(([name, lat, lng]) => ({ name, d: distanceKm(c, { lat, lng }) })).sort((a, b) => a.d - b.d)[0];
    let name = nearest && nearest.d < 25 ? nearest.name : `Area ${c.lat.toFixed(2)}, ${c.lng.toFixed(2)}`;
    if (all.some((x) => x.name === name)) name = `${name} ${all.length + created.length + 1}`;
    const [row] = await db
      .insert(cities)
      .values({ name, slug: slugify(name), centerLat: c.lat, centerLng: c.lng, radiusKm: AREA_RADIUS_KM })
      .onConflictDoNothing()
      .returning();
    if (row) {
      all.push(row);
      created.push(name);
    }
  }
  return created;
}

/** Posizione attuale dei veicoli + foto della flotta. Restituisce veicolo → città. */
export async function syncVehicles(client: AtomClient, initialAreas: CityArea[]) {
  const now = new Date();
  const previous = new Map(
    (await db.select({ atomId: vehicles.atomId, cityId: vehicles.cityId }).from(vehicles)).map((v) => [v.atomId, v.cityId]),
  );
  const atomVehicles = await client.vehicles();
  const points = atomVehicles
    .map((v) => (v.coordinates ? { lat: v.coordinates.latitude, lng: v.coordinates.longitude } : null))
    .filter((p): p is { lat: number; lng: number } => p !== null && Number.isFinite(p.lat) && (p.lat !== 0 || p.lng !== 0));
  const newCities = await createMissingCities(points, initialAreas);
  const areas = newCities.length ? await activeAreas() : initialAreas;
  const rows = atomVehicles.map((v) => mapVehicle(v, areas, previous.get(v.id) ?? null));
  for (const part of chunks(rows)) {
    await db
      .insert(vehicles)
      .values(part.map((v) => ({ ...v, updatedAt: now })))
      .onConflictDoUpdate({
        target: vehicles.atomId,
        set: {
          cityId: excluded("city_id"),
          number: excluded("number"),
          status: excluded("status"),
          battery: excluded("battery"),
          lat: excluded("lat"),
          lng: excluded("lng"),
          totalRides: excluded("total_rides"),
          lastParkDate: excluded("last_park_date"),
          updatedAt: excluded("updated_at"),
        },
      });
    await db.insert(vehicleSnapshots).values(
      part.map((v) => ({ cityId: v.cityId, takenAt: now, atomId: v.atomId, status: v.status, battery: v.battery, lat: v.lat, lng: v.lng })),
    );
  }
  return {
    areas,
    newCities,
    vehicleCity: new Map(rows.map((v) => [v.atomId, v.cityId])),
    vehicles: rows.length,
    vehiclesWithoutCity: rows.filter((v) => v.cityId === null).length,
  };
}

export async function saveRides(atomRides: AtomRide[], vehicleCity: Map<number, number | null>, areas: CityArea[], since?: Date) {
  const rows = atomRides
    .map((r) => mapRide(r, vehicleCity, areas))
    .filter((r): r is NonNullable<typeof r> => r !== null && (!since || r.startTime >= since));
  for (const part of chunks(rows)) {
    await db
      .insert(rides)
      .values(part)
      .onConflictDoUpdate({
        target: rides.atomId,
        set: { endTime: excluded("end_time"), price: excluded("price"), km: excluded("km"), minutes: excluded("minutes") },
      });
  }
  return rows.length;
}

export async function updateLastRides() {
  await db.execute(sql`
    update vehicles v set last_ride_at = r.last
    from (select vehicle_atom_id, max(start_time) as last from rides group by vehicle_atom_id) r
    where r.vehicle_atom_id = v.atom_id`);
}

export async function syncCustomers(client: AtomClient) {
  return saveCustomers(await client.customers());
}

/** Quanti di questi utenti Atom non sono ancora nel database. */
async function countNewCustomers(atomIds: number[]): Promise<number> {
  if (!atomIds.length) return 0;
  const [row] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from customers where atom_id in (${sql.join(atomIds.map((id) => sql`${id}`), sql`, `)})`,
  );
  return atomIds.length - (row?.n ?? 0);
}

async function saveCustomers(atomCustomers: Parameters<typeof mapCustomer>[0][]) {
  const now = new Date();
  const rows = atomCustomers.map(mapCustomer);
  for (const part of chunks(rows)) {
    await db
      .insert(customers)
      .values(part.map((c) => ({ ...c, updatedAt: now })))
      .onConflictDoUpdate({
        target: customers.atomId,
        set: {
          name: excluded("name"),
          email: excluded("email"),
          phone: excluded("phone"),
          wallet: excluded("wallet"),
          debt: excluded("debt"),
          rides: excluded("rides"),
          blocked: excluded("blocked"),
          updatedAt: excluded("updated_at"),
        },
      });
  }
  return rows.length;
}

async function logged<T extends Record<string, unknown>>(kind: string, fn: () => Promise<T>) {
  const [run] = await db.insert(syncRuns).values({ kind }).returning();
  try {
    const counts = await fn();
    await db.update(syncRuns).set({ finishedAt: new Date(), ok: true, counts }).where(eq(syncRuns.id, run.id));
    return counts;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(syncRuns).set({ finishedAt: new Date(), ok: false, message }).where(eq(syncRuns.id, run.id));
    throw error;
  }
}

/** Sync giornaliera: veicoli, corse dall'ultima salvata (con un giorno di margine), clienti. */
export async function syncFromAtom(client = new AtomClient(atomAccountFromEnv())) {
  return logged("atom", async () => {
    const { vehicleCity, areas, newCities, ...fleet } = await syncVehicles(client, await activeAreas());
    const [{ last }] = await db.select({ last: max(rides.startTime) }).from(rides);
    const since = last ? new Date(new Date(last).getTime() - 86_400_000) : new Date(Date.now() - 30 * 86_400_000);
    const ridesSaved = await saveRides(await client.ridesSince(since), vehicleCity, areas, since);
    await updateLastRides();
    const customersSaved = await syncCustomers(client);
    return { ...fleet, newCities: newCities.join(", "), rides: ridesSaved, customers: customersSaved };
  });
}

type BackfillState = {
  /**
   * Prima le corse recenti, poi lo storico delle corse finestra per finestra
   * (senza filtro per data Atom restituisce solo un periodo recente), infine i clienti.
   */
  phase?: "rides" | "customers" | "history";
  /** Storico: forma di date_range accettata da Atom e fine della finestra in corso (YYYY-MM-DD). */
  rangeShape?: string | null;
  windowEnd?: string;
  oldestRide?: string | null;
  customersBookmark?: string | null;
  /** Elenco dei formati di date provati quando nessuno ha funzionato. */
  rangeTried?: string;
  /** Pagine di utenti di fila senza nessun utente nuovo. */
  staleCustomerPages?: number;
  /** Durata dell'ultima pagina clienti, per capire se Atom è lento. */
  lastPageMs?: number;
  bookmark: string | null;
  pages: number;
  rides: number;
  customers?: number;
  done: boolean;
  startedAt: string;
  /** Ultimo errore e quanti blocchi di fila sono falliti (si azzera al primo blocco riuscito). */
  lastError?: string | null;
  errors?: number;
};

export async function getBackfillState(): Promise<BackfillState | null> {
  const [row] = await db.select().from(syncState).where(eq(syncState.key, "backfill"));
  return (row?.value as BackfillState) ?? null;
}

/** Stato dell'import con l'ora dell'ultimo avanzamento salvato. */
export async function getBackfillStatus() {
  const [row] = await db.select().from(syncState).where(eq(syncState.key, "backfill"));
  return row ? { state: row.value as BackfillState, updatedAt: row.updatedAt } : null;
}

/** Registra un blocco fallito; restituisce quanti blocchi di fila sono falliti. */
export async function recordBackfillError(message: string): Promise<number> {
  const state = await getBackfillState();
  if (!state) return 0;
  state.errors = (state.errors ?? 0) + 1;
  state.lastError = message.slice(0, 300);
  await setBackfillState(state);
  return state.errors;
}

async function setBackfillState(value: BackfillState) {
  await db
    .insert(syncState)
    .values({ key: "backfill", value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: syncState.key, set: { value, updatedAt: new Date() } });
}

/**
 * Import dello storico a blocchi: scarica pagine di corse finché c'è tempo, poi salva il segno
 * e riprende dalla chiamata successiva. Adatto ai limiti di durata delle funzioni Vercel.
 */
export async function backfillStep(budgetMs = 240_000, restart = false, client = new AtomClient(atomAccountFromEnv())) {
  const started = Date.now();
  let state = restart ? null : await getBackfillState();
  let areas: CityArea[] = await activeAreas();
  let vehicleCity: Map<number, number | null>;

  if (!state || state.done) {
    state = { phase: "rides", bookmark: null, pages: 0, rides: 0, customers: 0, done: false, startedAt: new Date().toISOString() };
    const fleet = await syncVehicles(client, areas);
    vehicleCity = fleet.vehicleCity;
    areas = fleet.areas;
  } else {
    vehicleCity = new Map((await db.select({ a: vehicles.atomId, c: vehicles.cityId }).from(vehicles)).map((v) => [v.a, v.c]));
  }
  state.phase ??= "rides";
  state.customers ??= 0;

  // Almeno una pagina per blocco, così ogni blocco fa sempre un passo avanti.
  do {
    if (state.phase === "rides") {
      const page = await client.ridesPage(state.bookmark);
      state.rides += await saveRides(page.rides, vehicleCity, areas);
      state.pages++;
      state.bookmark = page.next;
      if (!page.next) {
        state.phase = "history";
        await updateLastRides();
      }
    } else if (state.phase === "customers" && (state.rangeShape === undefined || (state.rangeShape === null && state.rangeTried !== shapeList()))) {
      // Ritenta lo storico se è stato saltato con una versione che provava meno formati di date.
      delete state.rangeShape;
      // Import avviato con la versione precedente: prima lo storico corse, poi si riprendono i clienti da dov'erano.
      state.customersBookmark = state.bookmark;
      state.bookmark = null;
      state.phase = "history";
    } else if (state.phase === "history") {
      if (await historyStep(client, state, vehicleCity, areas)) {
        await updateLastRides();
        state.phase = "customers";
        state.bookmark = state.customersBookmark ?? null;
      }
    } else {
      const t = Date.now();
      const page = await client.customersPage(state.bookmark);
      state.lastPageMs = Date.now() - t;
      const fresh = await countNewCustomers(page.customers.map((c) => c.id));
      await saveCustomers(page.customers);
      state.customers += fresh;
      state.pages++;
      // Se Atom ripete sempre le stesse pagine (bookmark ignorato) ci si ferma invece di girare a vuoto.
      state.staleCustomerPages = fresh > 0 ? 0 : (state.staleCustomerPages ?? 0) + 1;
      const looping = page.next === state.bookmark || state.staleCustomerPages >= 30;
      state.bookmark = page.next;
      if (looping) state.lastError = "Atom ripete le stesse pagine di utenti: import utenti fermato";
      if (!page.next || looping) {
        state.done = true;
        break;
      }
    }
    if (state.errors) {
      state.errors = 0;
      state.lastError = null;
    }
    await setBackfillState(state);
  } while (Date.now() - started < budgetMs);
  await setBackfillState(state);
  return state;
}

const HISTORY_WINDOW_DAYS = 14;
const shapeList = () => Object.keys(DATE_RANGE_SHAPES).join(",");

/**
 * Una pagina dello storico corse. Va indietro a finestre di 14 giorni da oggi fino a
 * ATOM_HISTORY_START (default 2024-01-01). Restituisce true quando lo storico è finito.
 */
async function historyStep(client: AtomClient, state: BackfillState, vehicleCity: Map<number, number | null>, areas: CityArea[]) {
  const historyStart = process.env.ATOM_HISTORY_START || "2024-01-01";
  if (state.rangeShape === undefined) {
    const probeEnd = addDays(localDay(), -70);
    state.rangeShape = await client.detectDateRangeShape(addDays(probeEnd, -6), probeEnd);
    state.windowEnd = localDay();
    if (!state.rangeShape) {
      state.rangeTried = shapeList();
      state.lastError = "Atom non accetta il filtro per data delle corse: importate solo le corse recenti";
      return true;
    }
  }
  if (!state.rangeShape || !state.windowEnd || state.windowEnd < historyStart) return true;

  const build = DATE_RANGE_SHAPES[state.rangeShape];
  const from = addDays(state.windowEnd, -(HISTORY_WINDOW_DAYS - 1));
  const page = await client.ridesPage(state.bookmark, build(from, state.windowEnd));
  state.rides += await saveRides(page.rides, vehicleCity, areas);
  state.pages++;
  if (page.rides.length) state.oldestRide = from;
  state.bookmark = page.next;
  if (!page.next) {
    state.windowEnd = addDays(from, -1);
    state.bookmark = null;
  }
  return state.windowEnd < historyStart;
}

/** Lock semplice nel database, così un solo blocco di import gira alla volta. */
export async function acquireLock(name: string, ms: number): Promise<boolean> {
  const until = new Date(Date.now() + ms).toISOString();
  const rows = await db.execute<{ key: string }>(sql`
    insert into sync_state (key, value, updated_at) values (${name}, ${JSON.stringify({ until })}::jsonb, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
    where (sync_state.value->>'until')::timestamptz < now()
    returning key`);
  return rows.length > 0;
}

export async function releaseLock(name: string) {
  await db.execute(sql`delete from sync_state where key = ${name}`);
}

export async function isLocked(name: string): Promise<boolean> {
  const rows = await db.execute<{ key: string }>(
    sql`select key from sync_state where key = ${name} and (value->>'until')::timestamptz > now()`,
  );
  return rows.length > 0;
}
