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
