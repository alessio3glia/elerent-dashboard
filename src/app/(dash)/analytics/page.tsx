import Link from "next/link";
import { Card, Delta, PageHeader } from "@/components/ui";
import { TrendChart } from "@/components/trend-chart";
import { addDays, formatDay, localDay, sameWeekdayLastYear } from "@/lib/dates";
import { METRICS, formatMetric, metricByKey } from "@/lib/metrics/catalog";
import { inRange, sumByDay, type Totals } from "@/lib/metrics/aggregate";
import { fleetStatusThisMonth, SIGNAL_HOURS } from "@/lib/fleet-status";
import { monthLabel, sameMonthLastYear } from "@/lib/metrics/monthly";
import { firstMetricDay, lastMetricDay, listCities, metricsBetween, monthlyFromRides } from "@/lib/queries";

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

  const today = localDay();
  const lyMonth = sameMonthLastYear(today.slice(0, 7));
  const [cities, last, first, fleet, lyFleet] = await Promise.all([
    listCities({ all: true }),
    lastMetricDay(),
    firstMetricDay(),
    fleetStatusThisMonth(),
    // Mezzi paganti negli stessi giorni del mese, un anno fa.
    monthlyFromRides({ months: [lyMonth], untilDay: Number(today.slice(8)) }),
  ]);
  const days = range.days ?? (first ? Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1 : 30);
  const from = addDays(last, -(days - 1));
  const prevFrom = addDays(from, -days);
  const selected = cities.find((c) => c.slug === citySlug);
  const lyFrom = sameWeekdayLastYear(from);
  const lyLast = sameWeekdayLastYear(last);
  const [rows, lyRows] = await Promise.all([
    metricsBetween(prevFrom, last, selected ? [selected.id] : undefined),
    // Stesso periodo dell'anno prima, allineato al giorno della settimana.
    metricsBetween(lyFrom, lyLast, selected ? [selected.id] : undefined),
  ]);

  const series = sumByDay(rows);
  const current = inRange(series, from, last);
  const previous = inRange(series, prevFrom, addDays(from, -1));
  const value = metric.total(current);
  const prevValue = range.days ? metric.total(previous) : null;
  const delta = value !== null && prevValue ? (value - prevValue) / prevValue : null;
  const lySeries = sumByDay(lyRows);
  const lyValue = lySeries.length ? metric.total(lySeries) : null;
  const deltaLy = value !== null && lyValue ? (value - lyValue) / lyValue : null;
  const lyByDay = new Map(lySeries.map((r) => [r.day, r]));

  const useWeeks = days > 120;
  const lyWeeks = new Map(weekly(lySeries).map(([day, r]) => [day, r]));
  const chart = useWeeks
    ? weekly(current).map(([day, r]) => {
        const ly = lyWeeks.get(sameWeekdayLastYear(day));
        return { day, value: metric.total(r), prev: ly ? metric.total(ly) : null };
      })
    : current.map((r) => {
        const ly = lyByDay.get(sameWeekdayLastYear(r.day));
        return { day: r.day, value: metric.daily(r), prev: ly ? metric.daily(ly) : null };
      });
  const estimated = current.some((r) => r.estimated);

  const byCity = cities
    .filter((c) => !selected || c.id === selected.id)
    .map((c) => {
      const mine = sumByDay(rows.filter((r) => r.cityId === c.id));
      const v = metric.total(inRange(mine, from, last));
      const p = range.days ? metric.total(inRange(mine, prevFrom, addDays(from, -1))) : null;
      const lyMine = sumByDay(lyRows.filter((r) => r.cityId === c.id));
      const ly = lyMine.length ? metric.total(lyMine) : null;
      return { city: c, value: v, delta: v !== null && p ? (v - p) / p : null, deltaLy: v !== null && ly ? (v - ly) / ly : null };
    })
    .filter((r) => r.city.active || (r.value ?? 0) > 0)
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));

  const fleetRows = fleet
    .filter((r) => !selected || r.city_id === selected.id)
    .map((r) => ({ ...r, city: cities.find((c) => c.id === r.city_id), ly: lyFleet.filter((x) => x.cityId === r.city_id).reduce((a, x) => a + x.vehicles, 0) }))
    .filter((r) => r.city?.active || r.paganti > 0)
    .sort((a, b) => b.paganti - a.paganti);
  const fleetTotal = fleetRows.reduce((a, r) => ({ paganti: a.paganti + r.paganti, operativi: a.operativi + r.operativi, non_attivi: a.non_attivi + r.non_attivi }), { paganti: 0, operativi: 0, non_attivi: 0 });
  const lyPaying = lyFleet.filter((x) => !selected || x.cityId === selected.id).reduce((a, x) => a + x.vehicles, 0);
  const vsLy = (a: number, b: number) => (b ? (a - b) / b : null);
  const month = monthLabel(localDay().slice(0, 7));

  const href = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ metrica: metric.key, periodo: range.key, citta: citySlug, ...patch });
    return `/analytics?${q}`;
  };

  return (
    <>
      <PageHeader title="Analytics" subtitle={`${formatDay(from)} – ${formatDay(last)}${selected ? ` · ${selected.name}` : " · tutta la rete"}`}>
        <Link href="/analytics/mensile" className="btn-secondary">Confronto anno su anno</Link>
      </PageHeader>

      <Card title={`Veicoli di ${month}${selected ? ` · ${selected.name}` : ""}`} className="mb-6 overflow-x-auto">
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FleetBox label="Paganti" value={fleetTotal.paganti} hint={`almeno una corsa dal 1° del mese: su questi si paga la fee · anno prima, stessi giorni: ${lyPaying}`} delta={vsLy(fleetTotal.paganti, lyPaying)} strong />
          <FleetBox label="Operativi senza corse" value={fleetTotal.operativi} hint={`mandano segnale (ultime ${SIGNAL_HOURS} ore) ma nessuna corsa nel mese`} />
          <FleetBox label="Non attivi" value={fleetTotal.non_attivi} hint="nessuna corsa nel mese e nessun segnale" />
        </div>
        <table className="table tabular">
          <thead>
            <tr>
              <th>Città</th>
              <th className="text-right">Paganti</th>
              <th className="text-right">Anno prima</th>
              <th className="text-right">vs anno prima</th>
              <th className="text-right">Operativi senza corse</th>
              <th className="text-right">Non attivi</th>
            </tr>
          </thead>
          <tbody>
            {fleetRows.map((r) => (
              <tr key={r.city_id ?? "none"}>
                <td>{r.city ? r.city.name : "Senza città"}{r.city && !r.city.active && <span className="ml-2 text-xs text-ink-3">non operativa</span>}</td>
                <td className="text-right font-medium text-brand">{formatMetric(r.paganti, "num")}</td>
                <td className="text-right text-ink-2">{formatMetric(r.ly, "num")}</td>
                <td className="text-right"><Delta value={vsLy(r.paganti, r.ly)} /></td>
                <td className="text-right">{formatMetric(r.operativi, "num")}</td>
                <td className="text-right text-ink-3">{formatMetric(r.non_attivi, "num")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

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
        {cities.filter((c) => c.active || c.id === selected?.id).map((c) => (
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
            <Delta value={deltaLy} higherIsBetter={metric.higherIsBetter} />
            <span className="text-xs text-ink-3">vs anno prima{lyValue !== null ? ` (${formatMetric(lyValue, metric.format)})` : ""}</span>
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
                <th className="text-right">vs anno prima</th>
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
                  <td className="text-right"><Delta value={r.deltaLy} higherIsBetter={metric.higherIsBetter} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

function FleetBox({ label, value, hint, strong, delta }: { label: string; value: number; hint: string; strong?: boolean; delta?: number | null }) {
  return (
    <div className={`rounded-lg p-4 ${strong ? "bg-brand-soft" : "bg-surface-2"}`}>
      <div className="text-sm text-ink-2">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`tabular text-3xl font-semibold ${strong ? "text-brand" : ""}`}>{formatMetric(value, "num")}</span>
        {delta !== undefined && <Delta value={delta} />}
      </div>
      <div className="mt-1 text-xs text-ink-3">{hint}</div>
    </div>
  );
}
