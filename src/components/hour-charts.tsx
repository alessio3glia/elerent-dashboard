"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const axis = { tick: { fill: "var(--ink-3)", fontSize: 12 }, axisLine: false, tickLine: false } as const;
const tooltip = {
  contentStyle: { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--ink)" },
  cursor: { stroke: "var(--ink-3)", strokeWidth: 1 },
} as const;

/** Corse cumulate di oggi contro lo stesso giorno della settimana scorsa, ora per ora. */
export function PaceChart({ data, height = 220 }: { data: { hour: string; today: number | null; week1: number }[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Corse di oggi ora per ora contro la settimana scorsa">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="hour" {...axis} minTickGap={24} />
          <YAxis {...axis} width={48} allowDecimals={false} />
          <Tooltip {...tooltip} formatter={(v, name) => [v as number, name === "today" ? "Oggi" : "Settimana scorsa"]} />
          <Legend formatter={(v) => (v === "today" ? "Oggi" : "Stesso giorno settimana scorsa")} wrapperStyle={{ fontSize: 12, color: "var(--ink-2)" }} />
          <Line type="monotone" dataKey="week1" stroke="var(--ink-3)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
          <Line type="monotone" dataKey="today" stroke="var(--brand)" strokeWidth={2.5} dot={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Per ogni ora: corse medie partite (barre) e mezzi disponibili in media (linea). */
export function AvailabilityChart({ data, height = 260 }: { data: { hour: string; available: number | null; rides: number }[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Mezzi disponibili e corse per fascia oraria">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="hour" {...axis} tickFormatter={(h: string) => `${h}:00`} minTickGap={16} />
          <YAxis yAxisId="r" {...axis} width={40} />
          <YAxis yAxisId="a" orientation="right" {...axis} width={40} />
          <Tooltip
            {...tooltip}
            labelFormatter={(h) => `Dalle ${h}:00 alle ${String((Number(h) + 1) % 24).padStart(2, "0")}:00`}
            formatter={(v, name) => [v as number, name === "rides" ? "Corse partite (media al giorno)" : "Mezzi disponibili (media)"]}
          />
          <Legend formatter={(v) => (v === "rides" ? "Corse partite" : "Mezzi disponibili")} wrapperStyle={{ fontSize: 12, color: "var(--ink-2)" }} />
          <Bar yAxisId="r" dataKey="rides" fill="var(--brand)" fillOpacity={0.35} radius={[3, 3, 0, 0]} />
          <Line yAxisId="a" type="monotone" dataKey="available" stroke="var(--ink)" strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
