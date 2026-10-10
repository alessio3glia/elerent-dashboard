import type { AtomCustomer, AtomRide, AtomVehicle } from "@/lib/atom/client";
import { parseBattery, parseDate, parseNumber } from "@/lib/atom/parse";
import { cityForPoint, type CityArea } from "@/lib/geo";

/** Id intero da Atom; "-", stringhe vuote o valori non numerici diventano null. */
export function toId(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null;
}

/** Intero generico (conteggi): null se non è un numero. */
function toInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Campi in cui Atom può riportare l'ultimo segnale del veicolo (il nome non è documentato). */
export const SIGNAL_FIELDS = [
  "last_signal", "last_signal_date", "last_seen", "last_seen_at", "last_connection", "last_connection_date", "last_online",
  "last_heartbeat", "last_ping", "last_update", "last_update_date", "last_location_update", "location_updated_at",
  "last_position_date", "last_gps_date", "iot_last_update", "iot_updated_at", "last_iot_update", "updated_at", "last_data_date",
];

export function signalDate(v: Record<string, unknown>): Date | null {
  for (const field of SIGNAL_FIELDS) {
    const date = parseDate(v[field]);
    if (date && date.getTime() <= Date.now() + 3_600_000) return date;
  }
  return null;
}

export function mapVehicle(v: AtomVehicle, areas: CityArea[], previousCityId: number | null) {
  const lat = v.coordinates?.latitude ?? null;
  const lng = v.coordinates?.longitude ?? null;
  const cityId = cityForPoint(lat !== null && lng !== null ? { lat, lng } : null, areas) ?? previousCityId;
  return {
    atomId: v.id,
    cityId,
    number: v.vehicle_number ?? null,
    status: v.status ?? null,
    battery: parseBattery(v.vehicle_battery),
    lat,
    lng,
    totalRides: toInt(v.total_rides),
    lastParkDate: parseDate(v.last_park_date),
    lastSignalAt: signalDate(v),
  };
}

export function mapRide(r: AtomRide, vehicleCity: Map<number, number | null>, areas: CityArea[]) {
  const start = parseDate(r.history_start_date ?? r.start_time);
  if (!start) return null;
  const end = parseDate(r.history_end_date ?? r.end_time);
  const loc = r.end_location ?? r.user_end_location;
  const endLoc = loc ? { lat: loc.latitude, lng: loc.longitude } : null;
  const atomId = toId(r.id);
  if (atomId === null) return null;
  const vehicleId = toId(r.vehicle_id);
  const cityId = (vehicleId !== null ? vehicleCity.get(vehicleId) : null) ?? cityForPoint(endLoc, areas) ?? null;
  return {
    atomId,
    cityId,
    vehicleAtomId: vehicleId,
    customerAtomId: toId(r.user_id),
    startTime: start,
    endTime: end,
    km: parseNumber(r.kilometers),
    minutes: end ? (end.getTime() - start.getTime()) / 60000 : null,
    price: parseNumber(r.price) ?? 0,
    chargedBalance: parseNumber(r.charged_balance),
    chargedBonus: parseNumber(r.charged_bonus),
    withSubscription: r.paid_with_subscription ? !["", "-", "no", "false"].includes(r.paid_with_subscription.toLowerCase()) : null,
    endLat: Number.isFinite(endLoc?.lat) && endLoc?.lat !== 0 ? endLoc!.lat : null,
    endLng: Number.isFinite(endLoc?.lng) && endLoc?.lng !== 0 ? endLoc!.lng : null,
  };
}

export function mapCustomer(c: AtomCustomer) {
  return {
    atomId: c.id,
    name: c.name ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    registeredAt: parseDate(c.date),
    wallet: parseNumber(c.wallet),
    debt: parseNumber(c.debt),
    rides: toInt(c.rides),
    blocked: c.blocked ?? null,
  };
}
