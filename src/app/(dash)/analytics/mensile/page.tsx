import Link from "next/link";
import { Card, Delta, Empty, PageHeader } from "@/components/ui";
import { addDays, localDay } from "@/lib/dates";
import { formatMetric } from "@/lib/metrics/catalog";
import { EMPTY_MONTH, change, monthLabel, monthsBetween, sameMonthLastYear, totalsByMonth, type MonthTotals } from "@/lib/metrics/monthly";
import { listCities, monthlyFromRides, type MonthRow } from "@/lib/queries";

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

  // Il mese in corso si confronta con gli stessi giorni dell'anno prima (fino a ieri, l'ultimo giorno completo).
  const refDay = addDays(localDay(), -1);
  const current = refDay.slice(0, 7);
  const untilDay = Number(refDay.slice(8, 10));
  const partialMonths = [current, sameMonthLastYear(current)];

  const [cities, all, partial] = await Promise.all([
    listCities(),
    monthlyFromRides(),
    monthlyFromRides({ months: partialMonths, untilDay }),
  ]);
  const rows: MonthRow[] = [...all.filter((r) => !partialMonths.includes(r.month)), ...partial];
  const selected = cities.find((c) => c.slug === citySlug);
  const scope = selected ? [selected] : cities;
  const totals = totalsByMonth(rows, scope);

  const first = [...totals.keys()].sort()[0];
  const months = first ? monthsBetween(first, current) : [];

  const thisMonthByCity = cities
    .map((c) => {
      const t = totalsByMonth(rows, [c]);
      return { city: c, now: t.get(current) ?? EMPTY_MONTH, before: t.get(sameMonthLastYear(current)) };
    })
    .filter((r) => r.now.rides > 0 || r.before)
    .sort((a, b) => b.now.vehicles - a.now.vehicles);

  const href = (slug: string) => `/analytics/mensile?citta=${slug}`;

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

          <Card title={`Mese per mese · ${selected ? selected.name : "tutta la rete"}`} className="overflow-x-auto">
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
