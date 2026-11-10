import type { City } from "@/lib/db/schema";
import type { MonthRow } from "@/lib/queries";

export type MonthTotals = { vehicles: number; rides: number; revenue: number; customers: number; elerentRevenue: number };

export const EMPTY_MONTH: MonthTotals = { vehicles: 0, rides: 0, revenue: 0, customers: 0, elerentRevenue: 0 };

/** Stesso mese dell'anno precedente ("2026-10" → "2025-10"). */
export function sameMonthLastYear(month: string): string {
  const [y, m] = month.split("-");
  return `${Number(y) - 1}-${m}`;
}

/** Mesi da `first` a `last` inclusi, dal più recente. */
export function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = last.split("-").map(Number);
  for (let guard = 0; guard < 600; guard++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key < first) break;
    out.push(key);
    if (--m === 0) { m = 12; y--; }
  }
  return out;
}

/**
 * Somma le città selezionate per mese. Il ricavo Elerent è una stima mensile:
 * % sul fatturato + fee per ogni veicolo con almeno una corsa nel mese.
 */
export function totalsByMonth(rows: MonthRow[], cities: Pick<City, "id" | "revenueSharePct" | "feePerVehicleMonth">[]) {
  const byId = new Map(cities.map((c) => [c.id, c]));
  const out = new Map<string, MonthTotals>();
  for (const r of rows) {
    const city = byId.get(r.cityId);
    if (!city) continue;
    const t = out.get(r.month) ?? { ...EMPTY_MONTH };
    t.vehicles += r.vehicles;
    t.rides += r.rides;
    t.revenue += r.revenue;
    t.customers += r.customers;
    t.elerentRevenue += (r.revenue * city.revenueSharePct) / 100 + r.vehicles * city.feePerVehicleMonth;
    out.set(r.month, t);
  }
  return out;
}

export function change(value: number, previous: number | undefined): number | null {
  return previous ? (value - previous) / previous : null;
}

export function monthLabel(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

type DayRow = { day: string; estimated: boolean };

/** Raggruppa le righe giornaliere per mese ("2026-10"). */
export function groupByMonth<T extends DayRow>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const m = r.day.slice(0, 7);
    if (!out.has(m)) out.set(m, []);
    out.get(m)!.push(r);
  }
  return out;
}

/**
 * Valore di una metrica su un mese a partire dalle righe giornaliere (già sommate per rete o città).
 * Con `untilDay` conta solo i giorni fino a quel numero, per confrontare il mese in corso con gli stessi giorni dell'anno prima.
 * Le metriche che esistono solo con la foto del mattino ignorano i giorni stimati: senza foto restano "—", non 0.
 */
export function monthValue<T extends DayRow>(
  metric: { total: (rows: T[]) => number | null; snapshotOnly?: boolean },
  rows: T[] | undefined,
  untilDay?: number,
): number | null {
  if (!rows?.length) return null;
  let r = untilDay ? rows.filter((x) => Number(x.day.slice(8, 10)) <= untilDay) : rows;
  if (metric.snapshotOnly) r = r.filter((x) => !x.estimated);
  return r.length ? metric.total(r) : null;
}

/** Variazione rispetto all'anno prima; null se manca uno dei due valori o se l'anno prima era 0. */
export function yoy(value: number | null, previous: number | null): number | null {
  return value !== null && previous ? (value - previous) / previous : null;
}
