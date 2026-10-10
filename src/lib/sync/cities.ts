import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { distanceKm } from "@/lib/geo";
import { ITALIAN_CITIES } from "@/lib/italian-cities";

const { cities, syncState } = schema;

async function nominatim(lat: number, lng: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=it&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "elerent-dashboard/1.0 (https://elerent-dashboard.vercel.app)" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  const a = ((await res.json()) as { address?: Record<string, string> }).address ?? {};
  return a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null;
}

async function bigDataCloud(lat: number, lng: number): Promise<string | null> {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=it`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return null;
  const body = (await res.json()) as { city?: string; locality?: string };
  return body.city || body.locality || null;
}

/**
 * Nome del comune in cui cade un punto: OpenStreetMap (Nominatim), poi BigDataCloud,
 * infine il comune più vicino della lista interna (entro 25 km).
 */
export async function placeName(lat: number, lng: number): Promise<string | null> {
  for (const lookup of [nominatim, bigDataCloud]) {
    try {
      const name = await lookup(lat, lng);
      if (name) return name;
    } catch {
      // servizio non raggiungibile: si prova il successivo
    }
  }
  const nearest = ITALIAN_CITIES.map(([name, clat, clng]) => ({ name, d: distanceKm({ lat, lng }, { lat: clat, lng: clng }) })).sort((a, b) => a.d - b.d)[0];
  return nearest && nearest.d < 25 ? nearest.name : null;
}

/** Nome unico: se esiste già un'altra città con lo stesso nome aggiunge un numero. */
function uniqueName(name: string, taken: Set<string>) {
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
}

const NAMING_KEY = "cities_named_v2";

/**
 * Dà il nome del comune vero alle città create in automatico. Ogni città si controlla una volta
 * (il primo nome veniva dal grande comune più vicino, spesso sbagliato); quelle ancora chiamate
 * "Area lat, lng" si riprovano sempre. Si ferma a `deadline` e riprende alla chiamata successiva.
 */
export async function nameCities(slugify: (s: string) => string, deadline = Date.now() + 40_000) {
  const [flag] = await db.select().from(syncState).where(eq(syncState.key, NAMING_KEY));
  const done = new Set<number>(((flag?.value as { ids?: number[] } | undefined)?.ids) ?? []);
  const all = await db.select().from(cities);
  const toName = all.filter((c) => !done.has(c.id) || c.name.startsWith("Area "));
  const renamed: string[] = [];
  for (const city of toName) {
    if (Date.now() > deadline) break;
    if (city.centerLat === null || city.centerLng === null) continue;
    const found = await placeName(city.centerLat, city.centerLng);
    done.add(city.id);
    if (found && found !== city.name) {
      const taken = new Set(all.filter((c) => c.id !== city.id).map((c) => c.name.toLowerCase()));
      const name = uniqueName(found, taken);
      const slugTaken = new Set(all.filter((c) => c.id !== city.id).map((c) => c.slug));
      let slug = slugify(name);
      for (let i = 2; slugTaken.has(slug); i++) slug = `${slugify(name)}-${i}`;
      await db.update(cities).set({ name, slug }).where(eq(cities.id, city.id));
      renamed.push(`${city.name} → ${name}`);
      city.name = name;
      city.slug = slug;
    }
    await new Promise((r) => setTimeout(r, 1100)); // Nominatim: massimo una richiesta al secondo
  }
  const value = { at: new Date().toISOString(), ids: [...done] };
  await db
    .insert(syncState)
    .values({ key: NAMING_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: syncState.key, set: { value, updatedAt: new Date() } });
  return renamed;
}

/**
 * Città operative: si disattivano quelle senza corse negli ultimi 365 giorni e si riattivano da sole
 * appena tornano ad avere corse negli ultimi 30 giorni. Le città disattivate restano nei dati storici.
 */
export async function updateCityActivity() {
  const off = await db.execute<{ name: string }>(sql`
    update cities c set active = false
    where c.active
      and not exists (select 1 from rides r where r.city_id = c.id and r.start_time >= now() - interval '365 days')
    returning c.name`);
  const on = await db.execute<{ name: string }>(sql`
    update cities c set active = true
    where not c.active
      and exists (select 1 from rides r where r.city_id = c.id and r.start_time >= now() - interval '30 days')
    returning c.name`);
  return { disattivate: off.map((r) => r.name), riattivate: on.map((r) => r.name) };
}
