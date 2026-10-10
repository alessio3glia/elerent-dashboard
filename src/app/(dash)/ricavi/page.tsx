import Link from "next/link";
import { MonthBars } from "@/components/month-bars";
import { TrendChart } from "@/components/trend-chart";
import { Card, Delta, PageHeader, StatTile } from "@/components/ui";
import { addDays, localDay } from "@/lib/dates";
import { formatMetric } from "@/lib/metrics/catalog";
import { monthLabel, sameMonthLastYear } from "@/lib/metrics/monthly";
import { listCities, monthlyFromRides } from "@/lib/queries";
import { revenueByDay, subscriptionRevenueByMonth, unpaidDebt } from "@/lib/revenue";

export const dynamic = "force-dynamic";

type Totals = { revenue: number; share: number; vehicles: number; fee: number; subs: number; subsN: number; rides: number };
const EMPTY: Totals = { revenue: 0, share: 0, vehicles: 0, fee: 0, subs: 0, subsN: 0, rides: 0 };
const elerent = (t: Totals) => t.share + t.fee;

export default async function RevenuePage({ searchParams }: PageProps<"/ricavi">) {
  const sp = await searchParams;
  const citySlug = typeof sp.citta === "string" ? sp.citta : "tutte";
  const today = localDay();
  const current = today.slice(0, 7);
  const [cities, months, subs, daily, debt] = await Promise.all([
    listCities({ all: true }),
    monthlyFromRides(),
    subscriptionRevenueByMonth(),
    revenueByDay(addDays(today, -59), today),
    unpaidDebt(),
  ]);
  const selected = cities.find((c) => c.slug === citySlug);
  const scope = selected ? [selected] : cities;
  const byId = new Map(cities.map((c) => [c.id, c]));

  // Totali per mese e città: quota % sul fatturato + fee per ogni mezzo pagante (almeno una corsa nel mese).
  const table = new Map<string, Map<number, Totals>>();
  const cell = (month: string, cityId: number) => {
    if (!table.has(month)) table.set(month, new Map());
    const m = table.get(month)!;
    if (!m.has(cityId)) m.set(cityId, { ...EMPTY });
    return m.get(cityId)!;
  };
  for (const r of months) {
    const city = byId.get(r.cityId);
    if (!city) continue;
    const t = cell(r.month, r.cityId);
    t.revenue += r.revenue;
    t.rides += r.rides;
    t.share += (r.revenue * city.revenueSharePct) / 100;
    t.vehicles += r.vehicles;
    t.fee += r.vehicles * city.feePerVehicleMonth;
  }
  for (const s of subs) {
    if (s.city_id === null) continue;
    const t = cell(s.month, s.city_id);
    t.subs += s.revenue;
    t.subsN += s.n;
  }
  const sum = (month: string, ids = scope.map((c) => c.id)) =>
    ids.reduce((a, id) => {
      const t = table.get(month)?.get(id);
      if (!t) return a;
      return { revenue: a.revenue + t.revenue, share: a.share + t.share, vehicles: a.vehicles + t.vehicles, fee: a.fee + t.fee, subs: a.subs + t.subs, subsN: a.subsN + t.subsN, rides: a.rides + t.rides };
    }, { ...EMPTY });

  const allMonths = [...table.keys()].filter((m) => m <= current).sort();
  const shown = allMonths.slice(-18);
  const now = sum(current);
  const prev = sum(sameMonthLastYear(current));
  const change = (a: number, b: number) => (b ? (a - b) / b : null);

  const scopeIds = new Set(scope.map((c) => c.id));
  const dailyShare = new Map<string, number>();
  for (const d of daily) {
    const city = byId.get(d.city_id);
    if (!city || !scopeIds.has(d.city_id)) continue;
    dailyShare.set(d.day, (dailyShare.get(d.day) ?? 0) + (d.revenue * city.revenueSharePct) / 100);
  }
  const shareSeries: { day: string; value: number }[] = [];
  for (let day = addDays(today, -59); day <= today; day = addDays(day, 1)) shareSeries.push({ day, value: Math.round((dailyShare.get(day) ?? 0) * 100) / 100 });

  const cityRows = cities
    .map((c) => ({ city: c, t: sum(current, [c.id]) }))
    .filter((r) => r.t.revenue > 0 || r.t.subs > 0)
    .sort((a, b) => elerent(b.t) - elerent(a.t));

  const href = (slug: string) => `/ricavi?citta=${slug}`;

  return (
    <>
      <PageHeader title="Ricavi" subtitle={`${selected ? selected.name : "Tutta la rete"} · quota sul fatturato giorno per giorno, fee dei mezzi mese per mese`}>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={href("tutte")} className={`rounded-lg px-3 py-1.5 ${!selected ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink"}`}>Tutte</Link>
          {cities.filter((c) => c.active || c.id === selected?.id).map((c) => (
            <Link key={c.id} href={href(c.slug)} className={`rounded-lg px-3 py-1.5 ${selected?.id === c.id ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink"}`}>{c.name}</Link>
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={`Ricavo Elerent · ${monthLabel(current)}`} value={formatMetric(elerent(now), "eur")} delta={change(elerent(now), elerent(prev))} hint="vs stesso mese anno scorso (intero)" />
        <StatTile label="Quota sul fatturato" value={formatMetric(now.share, "eur")} hint={`su ${formatMetric(now.revenue, "eur")} di corse`} />
        <StatTile label="Fee mezzi" value={formatMetric(now.fee, "eur")} hint={`${formatMetric(now.vehicles, "num")} mezzi paganti finora`} />
        <StatTile label="Abbonamenti" value={formatMetric(now.subs, "eur")} hint={`${formatMetric(now.subsN, "num")} venduti nel mese`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Ricavo Elerent mese per mese">
          <MonthBars data={shown.map((m) => { const t = sum(m); return { month: m, share: Math.round(t.share), fee: Math.round(t.fee), vehicles: t.vehicles }; })} />
        </Card>
        <Card title="Quota sul fatturato · giorno per giorno, 60 giorni">
          <TrendChart label="Quota sul fatturato" format="eur" data={shareSeries} height={280} />
        </Card>
      </div>

      <Card title="Mese per mese" className="mt-6 overflow-x-auto">
        <table className="table tabular">
          <thead>
            <tr>
              <th>Mese</th>
              <th className="text-right">Corse</th>
              <th className="text-right">Fatturato</th>
              <th className="text-right">Quota %</th>
              <th className="text-right">Mezzi paganti</th>
              <th className="text-right">Fee mezzi</th>
              <th className="text-right">Ricavo Elerent</th>
              <th className="text-right">vs anno prima</th>
              <th className="text-right">Abbonamenti</th>
            </tr>
          </thead>
          <tbody>
            {[...shown].reverse().map((m) => {
              const t = sum(m);
              const ly = sum(sameMonthLastYear(m));
              return (
                <tr key={m}>
                  <td className="capitalize">{monthLabel(m)}{m === current && <span className="ml-2 text-xs text-ink-3">in corso</span>}</td>
                  <td className="text-right">{formatMetric(t.rides, "num")}</td>
                  <td className="text-right">{formatMetric(t.revenue, "eur")}</td>
                  <td className="text-right">{formatMetric(t.share, "eur")}</td>
                  <td className="text-right">{formatMetric(t.vehicles, "num")}</td>
                  <td className="text-right">{formatMetric(t.fee, "eur")}</td>
                  <td className="text-right font-medium text-brand">{formatMetric(elerent(t), "eur")}</td>
                  <td className="text-right"><Delta value={change(elerent(t), elerent(ly))} /></td>
                  <td className="text-right">{formatMetric(t.subs, "eur")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
        <Card title={`Per città · ${monthLabel(current)}`} className="overflow-x-auto xl:col-span-2">
          <table className="table tabular">
            <thead>
              <tr>
                <th>Città</th>
                <th className="text-right">Fatturato</th>
                <th className="text-right">Quota %</th>
                <th className="text-right">Mezzi paganti</th>
                <th className="text-right">Fee mezzi</th>
                <th className="text-right">Ricavo Elerent</th>
                <th className="text-right">Abbonamenti</th>
              </tr>
            </thead>
            <tbody>
              {cityRows.map(({ city, t }) => (
                <tr key={city.id}>
                  <td><Link href={href(city.slug)} className="hover:text-brand">{city.name}</Link></td>
                  <td className="text-right">{formatMetric(t.revenue, "eur")}</td>
                  <td className="text-right">{formatMetric(t.share, "eur")}</td>
                  <td className="text-right">{formatMetric(t.vehicles, "num")}</td>
                  <td className="text-right">{formatMetric(t.fee, "eur")}</td>
                  <td className="text-right font-medium text-brand">{formatMetric(elerent(t), "eur")}</td>
                  <td className="text-right">{formatMetric(t.subs, "eur")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Corse non pagate">
          <div className="tabular text-3xl font-semibold text-critical">{formatMetric(debt.debt, "eur")}</div>
          <p className="mt-2 text-sm text-ink-2">Debito aperto di {formatMetric(debt.users, "num")} utenti secondo Atom: corse finite senza credito sufficiente.</p>
          <p className="mt-2 text-xs text-ink-3">Tutta la rete, ricontrollato a rotazione su tutti gli utenti.</p>
          <Link href="/recupero" className="btn-secondary mt-4">Vai al recupero crediti</Link>
        </Card>
      </div>
    </>
  );
}
