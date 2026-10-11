"use client";

import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMetric, type MetricFormat } from "@/lib/metrics/catalog";

/** `prev` è il valore dello stesso giorno della settimana dell'anno prima (linea tratteggiata). */
type Point = { day: string; value: number | null; prev?: number | null; estimated?: boolean };

const shortDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

export function TrendChart({ data, format, height = 240, label }: { data: Point[]; format: MetricFormat; height?: number; label: string }) {
  if (data.length === 0) return <p className="py-10 text-center text-sm text-ink-3">Nessun dato nel periodo</p>;
  const id = `g-${label.replace(/\W/g, "")}`;
  const withPrev = data.some((p) => p.prev !== undefined && p.prev !== null);
  return (
    <div style={{ height }} role="img" aria-label={`Andamento di ${label}${withPrev ? " confrontato con l'anno prima" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fill: "var(--ink-3)", fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={32} />
          <YAxis tickFormatter={(v: number) => formatMetric(v, format)} tick={{ fill: "var(--ink-3)", fontSize: 12 }} axisLine={false} tickLine={false} width={72} />
          <Tooltip
            cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
            contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--ink)" }}
            labelFormatter={(d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
            formatter={(v, name) => [formatMetric(v as number, format), name === "prev" ? "Anno prima" : label]}
          />
          {withPrev && <Legend formatter={(v) => (v === "prev" ? "Anno prima" : label)} wrapperStyle={{ fontSize: 12, color: "var(--ink-2)" }} />}
          {withPrev && <Line type="monotone" dataKey="prev" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={{ r: 4 }} connectNulls />}
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--brand)"
            strokeWidth={2}
            fill={`url(#${id})`}
            dot={false}
            activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2, fill: "var(--brand)" }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
