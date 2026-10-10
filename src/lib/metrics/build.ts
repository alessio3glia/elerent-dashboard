import { isOnStreet } from "@/lib/atom/parse";
import { distanceKm } from "@/lib/geo";

export type SnapshotRow = { atomId: number; status: string | null; battery: number | null; lat: number | null; lng: number | null };

export type MetricInput = {
  day: string;
  revenueSharePct: number;
  feePerVehicleMonth: number;
  rides: number;
  revenue: number;
  uniqueCustomers: number;
  newCustomers: number;
  /** Veicoli con almeno una corsa nel giorno. */
  vehiclesWithRideToday: Set<number>;
  /** Veicoli con almeno una corsa negli ultimi 3 giorni (giorno incluso). */
  vehiclesWithRecentRide: Set<number>;
  /** Veicoli con almeno una corsa negli ultimi 7 giorni: stima della flotta per i giorni senza foto. */
  vehiclesActiveLast7: number;
  /** Veicoli paganti: almeno una corsa dal primo del mese fino a questo giorno (base della fee Elerent). */
  vehiclesPayingMonth: number;
  /** Veicoli che oggi hanno fatto la prima corsa del mese: la loro fee mensile si conta in questo giorno. */
  newPayingToday: number;
  snapshot: SnapshotRow[];
  previousSnapshot: SnapshotRow[];
};

export const LOW_BATTERY = 20;
export const STATIONARY_METERS = 50;

/**
 * Elerent guadagna una % sul fatturato + una fee mensile per ogni veicolo pagante, cioè con almeno una corsa
 * nel mese di calendario. La fee di un veicolo si conta nel giorno della sua prima corsa del mese,
 * così la somma dei giorni di un mese è esattamente quella da fatturare.
 */
export function elerentRevenue(revenue: number, newPayingToday: number, pct: number, feeMonth: number) {
  return (revenue * pct) / 100 + newPayingToday * feeMonth;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export function buildMetric(input: MetricInput) {
  const onStreet = input.snapshot.filter((v) => isOnStreet(v.status));
  const previous = new Map(input.previousSnapshot.map((v) => [v.atomId, v]));
  // Giorni storici: Atom non conserva le posizioni passate, quindi la flotta si stima dalle corse
  const hasSnapshot = input.snapshot.length > 0;
  const activeVehicles = hasSnapshot ? onStreet.length : input.vehiclesActiveLast7;

  const stationary = onStreet.filter((v) => {
    const before = previous.get(v.atomId);
    if (!before || v.lat === null || v.lng === null || before.lat === null || before.lng === null) return false;
    if (input.vehiclesWithRideToday.has(v.atomId)) return false;
    return distanceKm({ lat: v.lat, lng: v.lng }, { lat: before.lat, lng: before.lng }) * 1000 < STATIONARY_METERS;
  }).length;

  return {
    day: input.day,
    estimated: !hasSnapshot,
    rides: input.rides,
    revenue: round2(input.revenue),
    fleetSize: hasSnapshot ? input.snapshot.length : input.vehiclesActiveLast7,
    activeVehicles,
    vehiclesWithRide: input.vehiclesWithRideToday.size,
    feeVehicles: input.vehiclesPayingMonth,
    idleVehicles: hasSnapshot ? onStreet.filter((v) => !input.vehiclesWithRecentRide.has(v.atomId)).length : 0,
    lowBattery: onStreet.filter((v) => v.battery !== null && v.battery < LOW_BATTERY).length,
    stationaryVehicles: stationary,
    uniqueCustomers: input.uniqueCustomers,
    newCustomers: input.newCustomers,
    elerentRevenue: round2(
      elerentRevenue(input.revenue, input.newPayingToday, input.revenueSharePct, input.feePerVehicleMonth),
    ),
  };
}
