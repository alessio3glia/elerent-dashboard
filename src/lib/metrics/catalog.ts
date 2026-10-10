import type { DailyMetric } from "@/lib/db/schema";

type Row = Pick<
  DailyMetric,
  | "rides" | "revenue" | "activeVehicles" | "fleetSize" | "vehiclesWithRide" | "idleVehicles"
  | "lowBattery" | "stationaryVehicles" | "uniqueCustomers" | "newCustomers" | "elerentRevenue" | "feeVehicles"
>;

export type MetricFormat = "eur" | "eur2" | "num" | "num1" | "pct";

export type MetricDef = {
  key: string;
  label: string;
  description: string;
  format: MetricFormat;
  /** true se un aumento è positivo. */
  higherIsBetter: boolean;
  daily: (r: Row) => number | null;
  /** Valore sull'intero periodo (somma o media, a seconda della metrica). */
  total: (rows: Row[]) => number | null;
};

const s = (rows: Row[], f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
const mean = (rows: Row[], f: (r: Row) => number) => (rows.length ? s(rows, f) / rows.length : null);
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export const METRICS: MetricDef[] = [
  {
    key: "revenue", label: "Fatturato", format: "eur", higherIsBetter: true,
    description: "Somma del prezzo delle corse concluse.",
    daily: (r) => r.revenue, total: (rows) => s(rows, (r) => r.revenue),
  },
  {
    key: "elerentRevenue", label: "Ricavo Elerent", format: "eur", higherIsBetter: true,
    description: "10% del fatturato più 15 € al mese per ogni veicolo pagante (almeno una corsa nel mese di calendario). La fee di un veicolo si conta nel giorno della sua prima corsa del mese. Percentuale e fee si cambiano per città da Impostazioni.",
    daily: (r) => r.elerentRevenue, total: (rows) => s(rows, (r) => r.elerentRevenue),
  },
  {
    key: "feeVehicles", label: "Veicoli paganti del mese", format: "num", higherIsBetter: true,
    description: "Veicoli con almeno una corsa dal primo del mese a quel giorno: sono quelli su cui Elerent incassa la fee mensile.",
    daily: (r) => r.feeVehicles, total: (rows) => (rows.length ? rows[rows.length - 1].feeVehicles : null),
  },
  {
    key: "rides", label: "Corse", format: "num", higherIsBetter: true,
    description: "Numero di corse concluse.",
    daily: (r) => r.rides, total: (rows) => s(rows, (r) => r.rides),
  },
  {
    key: "avgPrice", label: "Prezzo medio corsa", format: "eur2", higherIsBetter: true,
    description: "Fatturato diviso per numero di corse.",
    daily: (r) => ratio(r.revenue, r.rides), total: (rows) => ratio(s(rows, (r) => r.revenue), s(rows, (r) => r.rides)),
  },
  {
    key: "activeVehicles", label: "Veicoli in strada", format: "num", higherIsBetter: true,
    description: "Veicoli in stato operativo nella foto del mattino (media sul periodo).",
    daily: (r) => r.activeVehicles, total: (rows) => mean(rows, (r) => r.activeVehicles),
  },
  {
    key: "ridesPerVehicle", label: "Corse per veicolo", format: "num1", higherIsBetter: true,
    description: "Corse al giorno per ogni veicolo in strada.",
    daily: (r) => ratio(r.rides, r.activeVehicles),
    total: (rows) => ratio(s(rows, (r) => r.rides), s(rows, (r) => r.activeVehicles)),
  },
  {
    key: "revenuePerVehicle", label: "Fatturato per veicolo", format: "eur2", higherIsBetter: true,
    description: "Fatturato al giorno per ogni veicolo in strada.",
    daily: (r) => ratio(r.revenue, r.activeVehicles),
    total: (rows) => ratio(s(rows, (r) => r.revenue), s(rows, (r) => r.activeVehicles)),
  },
  {
    key: "utilization", label: "Veicoli usati", format: "pct", higherIsBetter: true,
    description: "Quota dei veicoli in strada che hanno fatto almeno una corsa nel giorno.",
    daily: (r) => ratio(r.vehiclesWithRide, r.activeVehicles),
    total: (rows) => ratio(s(rows, (r) => r.vehiclesWithRide), s(rows, (r) => r.activeVehicles)),
  },
  {
    key: "idleVehicles", label: "Veicoli fermi da 3 giorni", format: "num", higherIsBetter: false,
    description: "Veicoli in strada senza corse negli ultimi 3 giorni (media sul periodo).",
    daily: (r) => r.idleVehicles, total: (rows) => mean(rows, (r) => r.idleVehicles),
  },
  {
    key: "lowBattery", label: "Batteria sotto il 20%", format: "num", higherIsBetter: false,
    description: "Veicoli in strada quasi scarichi nella foto del mattino (media sul periodo).",
    daily: (r) => r.lowBattery, total: (rows) => mean(rows, (r) => r.lowBattery),
  },
  {
    key: "stationaryVehicles", label: "Veicoli non spostati", format: "num", higherIsBetter: false,
    description: "Veicoli nello stesso punto del giorno prima e senza corse: indica riposizionamento mancato.",
    daily: (r) => r.stationaryVehicles, total: (rows) => mean(rows, (r) => r.stationaryVehicles),
  },
  {
    key: "uniqueCustomers", label: "Clienti attivi", format: "num", higherIsBetter: true,
    description: "Clienti diversi che hanno fatto almeno una corsa nel giorno (media sul periodo).",
    daily: (r) => r.uniqueCustomers, total: (rows) => mean(rows, (r) => r.uniqueCustomers),
  },
  {
    key: "newCustomers", label: "Nuovi clienti", format: "num", higherIsBetter: true,
    description: "Clienti alla prima corsa in assoluto.",
    daily: (r) => r.newCustomers, total: (rows) => s(rows, (r) => r.newCustomers),
  },
];

export const metricByKey = (key: string | undefined) => METRICS.find((m) => m.key === key) ?? METRICS[0];

export function formatMetric(value: number | null, format: MetricFormat): string {
  if (value === null || !Number.isFinite(value)) return "—";
  switch (format) {
    case "eur": return value.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" });
    case "eur2": return value.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "num1": return value.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    case "pct": return `${Math.round(value * 100)}%`;
    default: return Math.round(value).toLocaleString("it-IT", { useGrouping: "always" });
  }
}
