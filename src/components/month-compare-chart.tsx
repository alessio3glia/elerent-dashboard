"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMetric, type MetricFormat } from "@/lib/metrics/catalog";

/** `prev` è il valore dello stesso mese dell'anno prima. */
type Row = { month: string; value: number | null; prev: number | null };

const short = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
const long = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("it-IT", { month: "long", year: "numeric" });

/** Una metrica mese per mese: barra verde il mese, barra grigia lo stesso mese dell'anno prima. */
export function MonthCompareChart({ data, format, label, height = 280 }: { data: Row[]; format: MetricFormat; label: string; height?: number }) {
  if (data.length === 0) return <p className="py-10 text-center text-sm text-ink-3">Nessun dato</p>;
  return (
    <div style={{ height }} role="img" aria-label={`${label} mese per mese confrontato con lo stesso mese dell'anno prima`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={short} tick={{ fill: "var(--ink-3)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v: number) => formatMetric(v, format)} tick={{ fill: "var(--ink-3)", fontSize: 12 }} axisLine={false} tickLine={false} width={72} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--ink)" }}
            labelFormatter={(m) => long(String(m))}
            formatter={(v, name) => [formatMetric(v as number | null, format), name === "prev" ? "Stesso mese anno prima" : label]}
          />
          <Legend formatter={(v) => (v === "prev" ? "Stesso mese anno prima" : label)} wrapperStyle={{ fontSize: 12, color: "var(--ink-2)" }} />
          <Bar dataKey="prev" fill="var(--ink-3)" fillOpacity={0.45} radius={[4, 4, 0, 0]} />
          <Bar dataKey="value" fill="var(--brand)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
