import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { distanceKm } from "@/lib/geo";
import { ITALIAN_CITIES } from "@/lib/italian-cities";

const { cities, syncState } = schema;

/**
 * Nome del comune in cui cade un punto, da OpenStreetMap (Nominatim, reverse geocoding a livello di città).
 * Se il servizio non risponde si usa il comune più vicino della lista interna (entro 25 km).
 */
export async function placeName(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=it&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { "User-Agent": "elerent-dashboard/1.0" }, signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const body = (await res.json()) as { address?: Record<string, string> };
      const a = body.address ?? {};
      const name = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county;
      if (name) return name;
    }
  } catch {
    // si usa la lista interna
  }
  const nearest = ITALIAN_CITIES.map(([name, clat, clng]) => ({ name, d: distanceKm({ lat, lng }, { lat: clat, lng: clng }) })).sort((a, b) => a.d - b.d)[0];
  return nearest && nearest.d < 25 ? nearest.name : null;
}

/** Nome unico: se esiste già un'altra città con lo stesso nome aggiunge un numero. */
function uniqueName(name: string, taken: Set<string>) {
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
}

const NAMING_KEY = "cities_named_v1";

/**
 * Dà il nome del comune vero alle città create in automatico. Le aree chiamate "Area lat, lng" si rinominano sempre;
 * tutte le altre una sola volta (il primo nome veniva dal grande comune più vicino, spesso sbagliato).
 */
export async function nameCities(slugify: (s: string) => string) {
  const [flag] = await db.select().from(syncState).where(eq(syncState.key, NAMING_KEY));
  const all = await db.select().from(cities);
  const toName = all.filter((c) => !flag || c.name.startsWith("Area "));
  const renamed: string[] = [];
  for (const city of toName) {
    if (city.centerLat === null || city.centerLng === null) continue;
    const found = await placeName(city.centerLat, city.centerLng);
    if (!found || found === city.name) continue;
    const taken = new Set(all.filter((c) => c.id !== city.id).map((c) => c.name.toLowerCase()));
    const name = uniqueName(found, taken);
    const slugTaken = new Set(all.filter((c) => c.id !== city.id).map((c) => c.slug));
    let slug = slugify(name);
    for (let i = 2; slugTaken.has(slug); i++) slug = `${slugify(name)}-${i}`;
    await db.update(cities).set({ name, slug }).where(eq(cities.id, city.id));
    renamed.push(`${city.name} → ${name}`);
    city.name = name;
    city.slug = slug;
    await new Promise((r) => setTimeout(r, 1100)); // Nominatim: massimo una richiesta al secondo
  }
  if (!flag) {
    await db.insert(syncState).values({ key: NAMING_KEY, value: { at: new Date().toISOString() }, updatedAt: new Date() }).onConflictDoNothing();
  }
  return renamed;
}

/**
 * Città operative: si disattivano quelle senza corse negli ultimi 365 giorni (tranne quelle create da meno di 60 giorni,
 * che possono non aver ancora fatto corse) e si riattivano da sole appena tornano ad avere corse recenti.
 */
export async function updateCityActivity() {
  const off = await db.execute<{ name: string }>(sql`
    update cities c set active = false
    where c.active and c.created_at < now() - interval '60 days'
      and not exists (select 1 from rides r where r.city_id = c.id and r.start_time >= now() - interval '365 days')
    returning c.name`);
  const on = await db.execute<{ name: string }>(sql`
    update cities c set active = true
    where not c.active
      and exists (select 1 from rides r where r.city_id = c.id and r.start_time >= now() - interval '30 days')
    returning c.name`);
  return { disattivate: off.map((r) => r.name), riattivate: on.map((r) => r.name) };
}
