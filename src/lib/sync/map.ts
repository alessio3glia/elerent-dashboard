import type { AtomCustomer, AtomRide, AtomVehicle } from "@/lib/atom/client";
import { parseBattery, parseDate, parseNumber } from "@/lib/atom/parse";
import { cityForPoint, type CityArea } from "@/lib/geo";

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
    totalRides: v.total_rides ?? null,
    lastParkDate: parseDate(v.last_park_date),
  };
}

export function mapRide(r: AtomRide, vehicleCity: Map<number, number | null>, areas: CityArea[]) {
  const start = parseDate(r.history_start_date ?? r.start_time);
  if (!start) return null;
  const end = parseDate(r.history_end_date ?? r.end_time);
  const loc = r.end_location ?? r.user_end_location;
  const endLoc = loc ? { lat: loc.latitude, lng: loc.longitude } : null;
  const cityId =
    (r.vehicle_id !== null ? vehicleCity.get(r.vehicle_id) : null) ?? cityForPoint(endLoc, areas) ?? null;
  return {
    atomId: r.id,
    cityId,
    vehicleAtomId: r.vehicle_id,
    customerAtomId: r.user_id,
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
    rides: c.rides ?? null,
    blocked: c.blocked ?? null,
  };
}
