import Link from "next/link";
import { Card, Delta, Empty, PageHeader } from "@/components/ui";
import { MonthCompareChart } from "@/components/month-compare-chart";
import { addDays, localDay } from "@/lib/dates";
import { METRICS, formatMetric, metricByKey } from "@/lib/metrics/catalog";
import { sumByDay } from "@/lib/metrics/aggregate";
import {
  EMPTY_MONTH, change, groupByMonth, monthLabel, monthValue, monthsBetween, sameMonthLastYear, totalsByMonth, yoy, type MonthTotals,
} from "@/lib/metrics/monthly";
import { firstMetricDay, listCities, metricsBetween, monthlyFromRides, type MonthRow } from "@/lib/queries";

export const dynamic = "force-dynamic";

const COLUMNS: { key: keyof MonthTotals; label: string; format: "num" | "eur" }[] = [
  { key: "vehicles", label: "Veicoli attivi", format: "num" },
  { key: "rides", label: "Corse", format: "num" },
  { key: "revenue", label: "Fatturato", format: "eur" },
  { key: "elerentRevenue", label: "Ricavo Elerent (stima)", format: "eur" },
];

export default async function MonthlyPage({ searchParams }: PageProps<"/analytics/mensile">) {
  const sp = await searchParams;
  const citySlug = typeof sp.citta === "string" ? sp.citta : "tutte";
  const metric = metricByKey(typeof sp.metrica === "string" ? sp.metrica : undefined);

  // Il mese in corso si confronta con gli stessi giorni dell'anno prima (fino a ieri, l'ultimo giorno completo).
  const refDay = addDays(localDay(), -1);
  const current = refDay.slice(0, 7);
  const untilDay = Number(refDay.slice(8, 10));
  const partialMonths = [current, sameMonthLastYear(current)];

  const [cities, all, partial, firstDay] = await Promise.all([
    listCities({ all: true }),
    monthlyFromRides(),
    monthlyFromRides({ months: partialMonths, untilDay }),
    firstMetricDay(),
  ]);
  const rows: MonthRow[] = [...all.filter((r) => !partialMonths.includes(r.month)), ...partial];
  const selected = cities.find((c) => c.slug === citySlug);
  const scope = selected ? [selected] : cities;
  const totals = totalsByMonth(rows, scope);

  // Tutte le metriche del catalogo, mese per mese, dai KPI giornalieri sommati per la rete o la città scelta.
  const daily = firstDay ? await metricsBetween(firstDay, refDay, selected ? [selected.id] : undefined) : [];
  const dailyByMonth = groupByMonth(sumByDay(daily));

  const first = [...totals.keys(), ...dailyByMonth.keys()].sort()[0];
  const months = first ? monthsBetween(first, current) : [];
  const month = typeof sp.mese === "string" && months.includes(sp.mese) ? sp.mese : current;
  const lyMonth = sameMonthLastYear(month);
  /** Giorni da confrontare: il mese in corso fino a ieri, gli altri interi. */
  const until = (m: string) => (m === current || m === sameMonthLastYear(current) ? untilDay : undefined);
  const valueOf = (def: Pick<typeof metric, "total" | "snapshotOnly">, m: string) => monthValue(def, dailyByMonth.get(m), until(m));
  const lyEstimated = (dailyByMonth.get(lyMonth) ?? []).some((r) => r.estimated);

  const allMetrics = [
    ...METRICS.map((m) => ({ key: m.key, label: m.label, format: m.format, higherIsBetter: m.higherIsBetter, now: valueOf(m, month), before: valueOf(m, lyMonth), link: true })),
    {
      key: "customersMonth", label: "Clienti diversi nel mese", format: "num" as const, higherIsBetter: true, link: false,
      now: totals.get(month)?.customers ?? null, before: totals.get(lyMonth)?.customers ?? null,
    },
  ];

  const series = months.map((m) => ({ month: m, value: valueOf(metric, m), prev: valueOf(metric, sameMonthLastYear(m)) }));

  const thisMonthByCity = cities
    .map((c) => {
      const t = totalsByMonth(rows, [c]);
      return { city: c, now: t.get(current) ?? EMPTY_MONTH, before: t.get(sameMonthLastYear(current)) };
    })
    .filter((r) => r.now.rides > 0 || r.before)
    .sort((a, b) => b.now.vehicles - a.now.vehicles);

  const href = (slug: string, patch: Record<string, string> = {}) =>
    `/analytics/mensile?${new URLSearchParams({ citta: slug, mese: month, metrica: metric.key, ...patch })}`;
  const here = (patch: Record<string, string>) => href(citySlug, patch);
  const scopeName = selected ? selected.name : "tutta la rete";

  return (
    <>
      <PageHeader
        title="Confronto anno su anno"
        subtitle={`Ricostruito dalle corse: veicoli attivi = veicoli diversi con almeno una corsa nel mese. ${monthLabel(current)} è confrontato con gli stessi giorni (1–${untilDay}) dell'anno prima.`}
      >
        <Link href="/analytics" className="text-sm text-ink-2 hover:text-brand">← Analytics giornaliere</Link>
      </PageHeader>

      {months.length === 0 ? (
        <Empty>Nessuna corsa ancora importata.</Empty>
      ) : (
        <div className="grid gap-6">
          <Card title={`${monthLabel(current)} vs ${monthLabel(sameMonthLastYear(current))} · per città`} className="overflow-x-auto">
            <table className="table tabular">
              <thead>
                <tr>
                  <th>Città</th>
                  {COLUMNS.slice(0, 3).map((c) => (
                    <th key={c.key} className="text-right" colSpan={3}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {thisMonthByCity.map(({ city, now, before }) => (
                  <tr key={city.id}>
                    <td>
                      <Link href={href(city.slug)} className="hover:text-brand">{city.name}</Link>
                    </td>
                    {COLUMNS.slice(0, 3).map((c) => (
                      <Cells key={c.key} now={now[c.key]} before={before?.[c.key]} format={c.format} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-ink-3">Per ogni metrica: questo mese, stesso periodo dell&apos;anno scorso, variazione.</p>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Link href={href("tutte")} className={`rounded-lg px-3 py-1.5 text-sm ${!selected ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink"}`}>
              Tutte le città
            </Link>
            {cities.map((c) => (
              <Link key={c.id} href={href(c.slug)} className={`rounded-lg px-3 py-1.5 text-sm ${selected?.id === c.id ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink"}`}>
                {c.name}
              </Link>
            ))}
          </div>

          <Card title={`Tutte le metriche · ${monthLabel(month)} vs ${monthLabel(lyMonth)} · ${scopeName}`} className="overflow-x-auto">
            <div className="mb-4 flex flex-wrap gap-2">
              {months.map((m) => (
                <Link
                  key={m}
                  href={here({ mese: m })}
                  className={`rounded-full border px-3 py-1 text-sm capitalize ${m === month ? "border-brand bg-brand-soft text-brand" : "border-line text-ink-2 hover:text-ink"}`}
                >
                  {monthLabel(m)}
                </Link>
              ))}
            </div>
            <table className="table tabular">
              <thead>
                <tr>
                  <th>Metrica</th>
                  <th className="text-right capitalize">{monthLabel(month)}{until(month) && ` (1–${untilDay})`}</th>
                  <th className="text-right capitalize">{monthLabel(lyMonth)}{until(lyMonth) && ` (1–${untilDay})`}</th>
                  <th className="text-right">Variazione</th>
                </tr>
              </thead>
              <tbody>
                {allMetrics.map((r) => (
                  <tr key={r.key} className={r.key === metric.key ? "bg-surface-2" : undefined}>
                    <td>
                      {r.link ? <Link href={`${here({ metrica: r.key })}#mese-per-mese`} className="hover:text-brand">{r.label}</Link> : r.label}
                    </td>
                    <td className="text-right font-medium">{formatMetric(r.now, r.format)}</td>
                    <td className="text-right text-ink-3">{formatMetric(r.before, r.format)}</td>
                    <td className="text-right"><Delta value={yoy(r.now, r.before)} higherIsBetter={r.higherIsBetter} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-ink-3">
              Stessa definizione delle Analytics per ogni metrica: somme sul mese per corse, fatturato e ricavo, medie giornaliere per veicoli e clienti attivi.
              &quot;—&quot; quando l&apos;anno prima non ci sono dati (lo storico parte da maggio 2025).
              {lyEstimated && " Nell'anno prima Atom non conserva la foto del mattino: veicoli in strada e rapporti per veicolo sono stimati dalle corse, batteria, fermi e non spostati non esistono."}
              {" "}Il verde e il rosso tengono conto di quando un aumento è un peggioramento (es. veicoli fermi).
            </p>
          </Card>

          <Card title={`${metric.label} · mese per mese contro lo stesso mese dell'anno prima · ${scopeName}`} className="overflow-x-auto">
            <div id="mese-per-mese" className="mb-4 flex flex-wrap gap-2">
              {METRICS.map((m) => (
                <Link
                  key={m.key}
                  href={`${here({ metrica: m.key })}#mese-per-mese`}
                  className={`rounded-full border px-3 py-1 text-sm ${m.key === metric.key ? "border-brand bg-brand-soft text-brand" : "border-line text-ink-2 hover:text-ink"}`}
                >
                  {m.label}
                </Link>
              ))}
            </div>
            <MonthCompareChart label={metric.label} format={metric.format} data={[...series].reverse()} />
            <table className="table tabular mt-4">
              <thead>
                <tr>
                  <th>Mese</th>
                  <th className="text-right">{metric.label}</th>
                  <th className="text-right">Stesso mese anno prima</th>
                  <th className="text-right">Variazione</th>
                </tr>
              </thead>
              <tbody>
                {series.map((r) => (
                  <tr key={r.month}>
                    <td className="whitespace-nowrap capitalize">{monthLabel(r.month)}{r.month === current && ` (1–${untilDay})`}</td>
                    <td className="text-right font-medium">{formatMetric(r.value, metric.format)}</td>
                    <td className="text-right text-ink-3">{formatMetric(r.prev, metric.format)}</td>
                    <td className="text-right"><Delta value={yoy(r.value, r.prev)} higherIsBetter={metric.higherIsBetter} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-ink-3">{metric.description}</p>
          </Card>

          <Card title={`Corse, veicoli e fatturato dalle corse · ${scopeName}`} className="overflow-x-auto">
            <table className="table tabular">
              <thead>
                <tr>
                  <th>Mese</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="text-right" colSpan={3}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const now = totals.get(m) ?? EMPTY_MONTH;
                  const before = totals.get(sameMonthLastYear(m));
                  return (
                    <tr key={m}>
                      <td className="whitespace-nowrap capitalize">{monthLabel(m)}{m === current && ` (1–${untilDay})`}</td>
                      {COLUMNS.map((c) => (
                        <Cells key={c.key} now={now[c.key]} before={before?.[c.key]} format={c.format} />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-ink-3">
              Per ogni metrica: valore del mese, stesso mese dell&apos;anno prima, variazione. Ricavo Elerent stimato come % sul fatturato più la fee mensile per ogni veicolo attivo nel mese.
            </p>
          </Card>
        </div>
      )}
    </>
  );
}

function Cells({ now, before, format }: { now: number; before: number | undefined; format: "num" | "eur" }) {
  return (
    <>
      <td className="text-right">{formatMetric(now, format)}</td>
      <td className="text-right text-ink-3">{before === undefined ? "—" : formatMetric(before, format)}</td>
      <td className="text-right"><Delta value={change(now, before)} /></td>
    </>
  );
}
