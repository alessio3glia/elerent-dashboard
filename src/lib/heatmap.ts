import "server-only";
import { eq, sql } from "drizzle-orm";
import { AtomClient, atomAccountFromEnv, type AtomRebalancingZone } from "@/lib/atom/client";
import { db, schema } from "@/lib/db";

/** Fasce orarie (ora italiana) per filtrare la mappa. */
export const SLOTS = {
  tutte: { label: "Tutto il giorno", from: 0, to: 24 },
  mattina: { label: "Mattina 6-10", from: 6, to: 10 },
  giorno: { label: "Giorno 10-16", from: 10, to: 16 },
  sera: { label: "Sera 16-21", from: 16, to: 21 },
  notte: { label: "Notte 21-6", from: 21, to: 6 },
} as const;
export type Slot = keyof typeof SLOTS;

/** Lato della cella della griglia, in metri. */
export const CELL_METERS = 200;

export type HeatCell = { lat: number; lng: number; dLat: number; dLng: number; dep: number; arr: number };

const slotFilter = (col: string, slot: Slot) => {
  const s = SLOTS[slot];
  if (slot === "tutte") return sql`true`;
  const h = sql`extract(hour from ${sql.raw(col)} at time zone 'Europe/Rome')`;
  return s.from < s.to ? sql`${h} >= ${s.from} and ${h} < ${s.to}` : sql`(${h} >= ${s.from} or ${h} < ${s.to})`;
};

/**
 * Partenze e arrivi per cella di griglia (circa 200 m) in una città.
 * Atom non dà il punto di partenza delle corse: si usa dove il mezzo era stato lasciato dalla corsa precedente
 * (se finita entro 3 giorni). Se nel frattempo un operatore l'ha spostato, la partenza risulta nel punto vecchio.
 */
export async function heatCells(cityId: number, centerLat: number, days: number, slot: Slot): Promise<HeatCell[]> {
  const dLat = CELL_METERS / 111_320;
  const dLng = CELL_METERS / (111_320 * Math.cos((centerLat * Math.PI) / 180));
  const rows = await db.execute<{ x: number; y: number; dep: number; arr: number }>(sql`
    with r as (
      select city_id, start_time, coalesce(end_time, start_time) as end_at, end_lat, end_lng,
        lag(end_lat) over w as s_lat, lag(end_lng) over w as s_lng, lag(coalesce(end_time, start_time)) over w as prev_end
      from rides
      where vehicle_atom_id is not null and start_time >= now() - make_interval(days => ${days + 3}::int)
      window w as (partition by vehicle_atom_id order by start_time)
    ),
    mine as (select * from r where city_id = ${cityId} and start_time >= now() - make_interval(days => ${days}::int)),
    pts as (
      select floor(s_lng / ${dLng})::int as x, floor(s_lat / ${dLat})::int as y, 1 as dep, 0 as arr from mine
      where s_lat is not null and s_lng is not null and (s_lat <> 0 or s_lng <> 0)
        and prev_end >= start_time - interval '3 days' and ${slotFilter("start_time", slot)}
      union all
      select floor(end_lng / ${dLng})::int, floor(end_lat / ${dLat})::int, 0, 1 from mine
      where end_lat is not null and end_lng is not null and (end_lat <> 0 or end_lng <> 0) and ${slotFilter("end_at", slot)}
    )
    select x, y, sum(dep)::int as dep, sum(arr)::int as arr from pts group by x, y
    order by sum(dep) + sum(arr) desc
    limit 4000`);
  return rows.map((r) => ({ lat: r.y * dLat, lng: r.x * dLng, dLat, dLng, dep: r.dep, arr: r.arr }));
}

export type Point = { lat: number; lng: number };

/** Le celle con più partenze che insieme fanno `share` delle partenze: le "zone calde". */
export function hotCells(cells: HeatCell[], share = 0.5): HeatCell[] {
  const total = cells.reduce((s, c) => s + c.dep, 0);
  if (!total) return [];
  const sorted = [...cells].filter((c) => c.dep > 0).sort((a, b) => b.dep - a.dep);
  const out: HeatCell[] = [];
  let sum = 0;
  for (const c of sorted) {
    if (sum >= total * share) break;
    out.push(c);
    sum += c.dep;
  }
  return out;
}

export const inCell = (p: Point, c: HeatCell) => p.lat >= c.lat && p.lat < c.lat + c.dLat && p.lng >= c.lng && p.lng < c.lng + c.dLng;

/** Distanza in metri tra due punti. */
export function meters(a: Point, b: Point) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type RebalancingZone = { id: number; title: string; lat: number; lng: number; radius: number; target: number };

const ZONES_KEY = "rebalancing_zones";
const ZONES_EVERY_MS = 3_600_000;

export function toZone(z: AtomRebalancingZone): RebalancingZone | null {
  const lat = z.coordinates?.latitude;
  const lng = z.coordinates?.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  const target = z.vehicle_type_and_count?.length ? z.vehicle_type_and_count.reduce((s, x) => s + (x.count ?? 0), 0) : (z.count ?? 0);
  return { id: z.id, title: z.title?.trim() || `Zona ${z.id}`, lat: lat!, lng: lng!, radius: z.radius ?? 100, target };
}

/** Zone di riequilibrio di Atom, rilette al massimo una volta l'ora. Se Atom non risponde si usano quelle salvate. */
export async function rebalancingZones(): Promise<{ zones: RebalancingZone[]; at: string | null; error: string | null }> {
  const [row] = await db.select().from(schema.syncState).where(eq(schema.syncState.key, ZONES_KEY));
  const saved = row?.value as { zones: RebalancingZone[]; at: string } | undefined;
  if (saved && Date.now() - Date.parse(saved.at) < ZONES_EVERY_MS) return { ...saved, error: null };
  try {
    const raw = await new AtomClient(atomAccountFromEnv()).rebalancingZones();
    const value = { zones: raw.map(toZone).filter((z): z is RebalancingZone => z !== null), at: new Date().toISOString() };
    await db
      .insert(schema.syncState)
      .values({ key: ZONES_KEY, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.syncState.key, set: { value, updatedAt: new Date() } });
    return { ...value, error: null };
  } catch (error) {
    return { zones: saved?.zones ?? [], at: saved?.at ?? null, error: error instanceof Error ? error.message : String(error) };
  }
}
