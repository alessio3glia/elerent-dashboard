import Link from "next/link";
import { Card, Delta, PageHeader } from "@/components/ui";
import { TrendChart } from "@/components/trend-chart";
import { addDays, formatDay } from "@/lib/dates";
import { METRICS, formatMetric, metricByKey } from "@/lib/metrics/catalog";
import { inRange, sumByDay, type Totals } from "@/lib/metrics/aggregate";
import { firstMetricDay, lastMetricDay, listCities, metricsBetween } from "@/lib/queries";

const RANGES = [
  { key: "7", label: "7 giorni", days: 7 },
  { key: "30", label: "30 giorni", days: 30 },
  { key: "90", label: "90 giorni", days: 90 },
  { key: "365", label: "12 mesi", days: 365 },
  { key: "all", label: "Tutto lo storico", days: null },
] as const;

/** Raggruppa per settimana (lunedì) quando il periodo è lungo, per un grafico leggibile. */
function weekly(rows: Totals[]) {
  const buckets = new Map<string, Totals[]>();
  for (const r of rows) {
    const d = new Date(`${r.day}T12:00:00Z`);
    const monday = addDays(r.day, -((d.getUTCDay() + 6) % 7));
    if (!buckets.has(monday)) buckets.set(monday, []);
    buckets.get(monday)!.push(r);
  }
  return [...buckets.entries()];
}

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const sp = await searchParams;
  const metric = metricByKey(String(sp.metrica ?? ""));
  const range = RANGES.find((r) => r.key === sp.periodo) ?? RANGES[1];
  const citySlug = typeof sp.citta === "string" ? sp.citta : "tutte";

  const [cities, last, first] = await Promise.all([listCities(), lastMetricDay(), firstMetricDay()]);
  const days = range.days ?? (first ? Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1 : 30);
  const from = addDays(last, -(days - 1));
  const prevFrom = addDays(from, -days);
  const selected = cities.find((c) => c.slug === citySlug);
  const rows = await metricsBetween(prevFrom, last, selected ? [selected.id] : undefined);

  const series = sumByDay(rows);
  const current = inRange(series, from, last);
  const previous = inRange(series, prevFrom, addDays(from, -1));
  const value = metric.total(current);
  const prevValue = range.days ? metric.total(previous) : null;
  const delta = value !== null && prevValue ? (value - prevValue) / prevValue : null;

  const useWeeks = days > 120;
  const chart = useWeeks
    ? weekly(current).map(([day, r]) => ({ day, value: metric.total(r) }))
    : current.map((r) => ({ day: r.day, value: metric.daily(r) }));
  const estimated = current.some((r) => r.estimated);

  const byCity = cities
    .filter((c) => !selected || c.id === selected.id)
    .map((c) => {
      const mine = sumByDay(rows.filter((r) => r.cityId === c.id));
      const v = metric.total(inRange(mine, from, last));
      const p = range.days ? metric.total(inRange(mine, prevFrom, addDays(from, -1))) : null;
      return { city: c, value: v, delta: v !== null && p ? (v - p) / p : null };
    })
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));

  const href = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ metrica: metric.key, periodo: range.key, citta: citySlug, ...patch });
    return `/analytics?${q}`;
  };

  return (
    <>
      <PageHeader title="Analytics" subtitle={`${formatDay(from)} – ${formatDay(last)}${selected ? ` · ${selected.name}` : " · tutta la rete"}`} />

      <div className="mb-4 flex flex-wrap gap-2">
        {METRICS.map((m) => (
          <Link
            key={m.key}
            href={href({ metrica: m.key })}
            className={`rounded-full border px-3 py-1.5 text-sm ${m.key === metric.key ? "border-brand bg-brand-soft text-brand" : "border-line text-ink-2 hover:text-ink"}`}
          >
            {m.label}
          </Link>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={href({ periodo: r.key })}
            className={`rounded-lg px-3 py-1.5 text-sm ${r.key === range.key ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink"}`}
          >
            {r.label}
          </Link>
        ))}
        <span className="mx-2 h-5 w-px bg-line" />
        <Link href={href({ citta: "tutte" })} className={`rounded-lg px-3 py-1.5 text-sm ${!selected ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink"}`}>
          Tutte le città
        </Link>
        {cities.map((c) => (
          <Link key={c.id} href={href({ citta: c.slug })} className={`rounded-lg px-3 py-1.5 text-sm ${selected?.id === c.id ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink"}`}>
            {c.name}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title={`${metric.label} · ${useWeeks ? "per settimana" : "per giorno"}`}>
          <div className="mb-4 flex items-baseline gap-3">
            <span className="tabular text-4xl font-semibold tracking-tight">{formatMetric(value, metric.format)}</span>
            {range.days && <Delta value={delta} higherIsBetter={metric.higherIsBetter} />}
            {range.days && <span className="text-xs text-ink-3">vs {range.label} precedenti</span>}
          </div>
          <TrendChart label={metric.label} format={metric.format} data={chart} height={300} />
          <p className="mt-3 text-xs text-ink-3">
            {metric.description}
            {estimated && " I giorni prima della prima sincronizzazione hanno la flotta stimata dalle corse."}
          </p>
        </Card>

        <Card title="Per città" className="overflow-x-auto">
          <table className="table tabular">
            <thead>
              <tr>
                <th>Città</th>
                <th className="text-right">{metric.label}</th>
                {range.days && <th className="text-right">Variazione</th>}
              </tr>
            </thead>
            <tbody>
              {byCity.map((r) => (
                <tr key={r.city.id}>
                  <td>
                    <Link href={href({ citta: r.city.slug })} className="hover:text-brand">{r.city.name}</Link>
                  </td>
                  <td className="text-right">{formatMetric(r.value, metric.format)}</td>
                  {range.days && <td className="text-right"><Delta value={r.delta} higherIsBetter={metric.higherIsBetter} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
