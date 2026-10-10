import type { DailyMetric } from "@/lib/db/schema";

const FIELDS = [
  "rides", "revenue", "fleetSize", "activeVehicles", "vehiclesWithRide", "idleVehicles",
  "lowBattery", "stationaryVehicles", "uniqueCustomers", "newCustomers", "elerentRevenue", "feeVehicles",
] as const;

export type Totals = Record<(typeof FIELDS)[number], number> & { day: string; estimated: boolean };

/** Somma i KPI di più città per giorno (vista rete). */
export function sumByDay(rows: DailyMetric[]): Totals[] {
  const byDay = new Map<string, Totals>();
  for (const r of rows) {
    let t = byDay.get(r.day);
    if (!t) {
      t = { day: r.day, estimated: false, ...Object.fromEntries(FIELDS.map((f) => [f, 0])) } as Totals;
      byDay.set(r.day, t);
    }
    for (const f of FIELDS) t[f] += r[f];
    t.estimated ||= r.estimated;
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export function inRange<T extends { day: string }>(rows: T[], from: string, to: string) {
  return rows.filter((r) => r.day >= from && r.day <= to);
}
