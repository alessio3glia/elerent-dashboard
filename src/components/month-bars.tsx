"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMetric } from "@/lib/metrics/catalog";

/** `prev` è il ricavo Elerent dello stesso mese dell'anno prima (linea tratteggiata). */
type Row = { month: string; share: number; fee: number; vehicles: number; prev?: number | null };

const NAMES: Record<string, string> = { share: "Quota sul fatturato", fee: "Fee mezzi", prev: "Anno prima" };

const label = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("it-IT", { month: "short", year: "2-digit" });

/** Ricavo Elerent mese per mese: quota sul fatturato + fee dei mezzi paganti, impilate. */
export function MonthBars({ data, height = 280 }: { data: Row[]; height?: number }) {
  if (data.length === 0) return <p className="py-10 text-center text-sm text-ink-3">Nessun dato</p>;
  return (
    <div style={{ height }} role="img" aria-label="Ricavo Elerent per mese">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={label} tick={{ fill: "var(--ink-3)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v: number) => formatMetric(v, "eur")} tick={{ fill: "var(--ink-3)", fontSize: 12 }} axisLine={false} tickLine={false} width={72} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--ink)" }}
            labelFormatter={(m) => {
              const row = data.find((r) => r.month === m);
              const name = new Date(`${m}-15T12:00:00Z`).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
              return row ? `${name} · ${row.vehicles} mezzi paganti` : name;
            }}
            formatter={(v, name) => [formatMetric(v as number, "eur"), NAMES[String(name)] ?? String(name)]}
          />
          <Legend formatter={(v) => NAMES[String(v)] ?? v} wrapperStyle={{ fontSize: 12, color: "var(--ink-2)" }} />
          <Bar dataKey="share" stackId="a" fill="var(--brand)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="fee" stackId="a" fill="#a6f5c8" radius={[4, 4, 0, 0]} />
          {data.some((r) => r.prev) && <Line type="monotone" dataKey="prev" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 2.5, fill: "var(--ink-3)" }} connectNulls />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
