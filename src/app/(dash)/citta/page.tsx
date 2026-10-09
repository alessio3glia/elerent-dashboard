import Link from "next/link";
import { Card, Delta, Empty, PageHeader } from "@/components/ui";
import { addDays, formatDay } from "@/lib/dates";
import { formatMetric } from "@/lib/metrics/catalog";
import { lastMetricDay, listCities, metricsBetween } from "@/lib/queries";

export default async function CitiesPage() {
  const last = await lastMetricDay();
  const [cities, rows] = await Promise.all([listCities(), metricsBetween(addDays(last, -13), last)]);
  return (
    <>
      <PageHeader title="Città" subtitle={`Ultimi 7 giorni fino al ${formatDay(last)}`} />
      {cities.length === 0 && <Empty>Nessuna città configurata.</Empty>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cities.map((c) => {
          const mine = rows.filter((r) => r.cityId === c.id);
          const w = mine.filter((r) => r.day > addDays(last, -7));
          const pw = mine.filter((r) => r.day <= addDays(last, -7));
          const rev = w.reduce((a, r) => a + r.revenue, 0);
          const prev = pw.reduce((a, r) => a + r.revenue, 0);
          return (
            <Link key={c.id} href={`/citta/${c.slug}`}>
              <Card className="h-full transition-colors hover:border-brand">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-lg font-semibold">{c.name}</div>
                    <div className="text-sm text-ink-3">{c.affiliateName ?? "Affiliato non indicato"}</div>
                  </div>
                  {!c.active && <span className="text-xs text-ink-3">non attiva</span>}
                </div>
                <div className="tabular mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div><div className="text-ink-3">Fatturato</div>{formatMetric(rev, "eur")}</div>
                  <div><div className="text-ink-3">In strada</div>{formatMetric(mine.at(-1)?.activeVehicles ?? 0, "num")}</div>
                  <div><div className="text-ink-3">vs sett. prima</div><Delta value={prev ? (rev - prev) / prev : null} /></div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
