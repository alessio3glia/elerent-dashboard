export type Point = { lat: number; lng: number };
export type CityArea = { id: number; centerLat: number | null; centerLng: number | null; radiusKm: number };

export function distanceKm(a: Point, b: Point): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Città più vicina che contiene il punto nel suo raggio, altrimenti null. */
export function cityForPoint(point: Point | null, areas: CityArea[]): number | null {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  let best: { id: number; d: number } | null = null;
  for (const area of areas) {
    if (area.centerLat === null || area.centerLng === null) continue;
    const d = distanceKm(point, { lat: area.centerLat, lng: area.centerLng });
    if (d <= area.radiusKm && (!best || d < best.d)) best = { id: area.id, d };
  }
  return best?.id ?? null;
}
