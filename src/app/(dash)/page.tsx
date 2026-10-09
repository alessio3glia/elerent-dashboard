import Link from "next/link";
import { Card, Delta, PageHeader, PriorityBadge, StatTile } from "@/components/ui";
import { TrendChart } from "@/components/trend-chart";
import { addDays, formatDay, localDay } from "@/lib/dates";
import { METRICS, formatMetric } from "@/lib/metrics/catalog";
import { inRange, sumByDay } from "@/lib/metrics/aggregate";
import { lastMetricDay, lastSync, listCities, metricsBetween, recentAlerts, tasksForDay } from "@/lib/queries";

const metric = (key: string) => METRICS.find((m) => m.key === key)!;
const change = (a: number | null, b: number | null) => (a !== null && b ? (a - b) / b : null);

export default async function OverviewPage() {
  const last = await lastMetricDay();
  const [cities, rows, alerts, todayTasks, sync] = await Promise.all([
    listCities(),
    metricsBetween(addDays(last, -59), last),
    recentAlerts(1),
    tasksForDay(localDay()),
    lastSync(),
  ]);
  const network = sumByDay(rows);
  const cur30 = inRange(network, addDays(last, -29), last);
  const prev30 = inRange(network, addDays(last, -59), addDays(last, -30));

  const tiles = ["elerentRevenue", "revenue", "rides", "ridesPerVehicle"].map((key) => {
    const m = metric(key);
    const a = m.total(cur30);
    return { m, value: formatMetric(a, m.format), delta: change(a, m.total(prev30)) };
  });
  const lastDay = network.at(-1);
  const prevWeekVehicles = metric("activeVehicles").total(inRange(network, addDays(last, -7), addDays(last, -1)));

  const cityRows = cities
    .filter((c) => c.active)
    .map((c) => {
      const mine = rows.filter((r) => r.cityId === c.id);
      const w = inRange(mine, addDays(last, -6), last);
      const pw = inRange(mine, addDays(last, -13), addDays(last, -7));
      const rev = metric("revenue").total(w) ?? 0;
      return {
        city: c,
        vehicles: mine.at(-1)?.activeVehicles ?? 0,
        rides: metric("rides").total(w) ?? 0,
        revenue: rev,
        delta: change(rev, metric("revenue").total(pw)),
        elerent: metric("elerentRevenue").total(w) ?? 0,
        rpv: metric("ridesPerVehicle").total(w),
        alerts: alerts.filter((a) => a.city.id === c.id).length,
      };
    })
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));

  const openTasks = todayTasks.filter((t) => t.task.status === "aperta");

  return (
    <>
      <PageHeader
        title="Panoramica rete"
        subtitle={
          <>
            Dati fino al {formatDay(last)} · ultimi 30 giorni contro i 30 precedenti
            {sync && ` · ultima sincronizzazione ${sync.startedAt.toLocaleString("it-IT", { timeZone: "Europe/Rome" })}${sync.ok === false ? " (fallita)" : ""}`}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {tiles.map(({ m, value, delta }) => (
          <StatTile key={m.key} label={`${m.label} · 30 gg`} value={value} delta={delta} higherIsBetter={m.higherIsBetter} />
        ))}
        <StatTile
          label="Veicoli in strada"
          value={formatMetric(lastDay?.activeVehicles ?? 0, "num")}
          delta={change(lastDay?.activeVehicles ?? null, prevWeekVehicles)}
          hint={lastDay?.estimated ? "stimato dalle corse" : "vs media 7 gg"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
        <Card title="Ricavo Elerent giornaliero · 60 giorni" className="xl:col-span-2">
          <TrendChart label="Ricavo Elerent" format="eur" data={network.map((d) => ({ day: d.day, value: d.elerentRevenue }))} />
        </Card>
        <Card
          title={`Task di oggi · ${openTasks.length} aperte`}
          action={<Link href="/task" className="text-xs text-brand hover:underline">Apri tutte</Link>}
        >
          <ul className="space-y-3">
            {openTasks.slice(0, 6).map(({ task, city }) => (
              <li key={task.id} className="rounded-lg bg-surface-2 p-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-ink-3">
                  <PriorityBadge priority={task.priority} /> {city.name}
                </div>
                <div className="text-sm">{task.title}</div>
              </li>
            ))}
            {openTasks.length === 0 && <p className="text-sm text-ink-3">Nessuna task aperta. Ottimo lavoro.</p>}
          </ul>
        </Card>
      </div>

      <Card title="Città · ultimi 7 giorni, dalla peggiore" className="mt-6 overflow-x-auto">
        <table className="table tabular">
          <thead>
            <tr>
              <th>Città</th>
              <th className="text-right">In strada</th>
              <th className="text-right">Corse</th>
              <th className="text-right">Corse/veicolo</th>
              <th className="text-right">Fatturato</th>
              <th className="text-right">vs sett. prima</th>
              <th className="text-right">Ricavo Elerent</th>
              <th className="text-right">Alert oggi</th>
            </tr>
          </thead>
          <tbody>
            {cityRows.map((r) => (
              <tr key={r.city.id} className="hover:bg-surface-2">
                <td>
                  <Link href={`/citta/${r.city.slug}`} className="font-medium hover:text-brand">{r.city.name}</Link>
                  {r.city.affiliateName && <div className="text-xs text-ink-3">{r.city.affiliateName}</div>}
                </td>
                <td className="text-right">{formatMetric(r.vehicles, "num")}</td>
                <td className="text-right">{formatMetric(r.rides, "num")}</td>
                <td className="text-right">{formatMetric(r.rpv, "num1")}</td>
                <td className="text-right">{formatMetric(r.revenue, "eur")}</td>
                <td className="text-right"><Delta value={r.delta} /></td>
                <td className="text-right">{formatMetric(r.elerent, "eur")}</td>
                <td className="text-right">
                  {r.alerts > 0 ? <span className="rounded-full bg-critical/15 px-2 py-0.5 text-xs text-critical">{r.alerts}</span> : <span className="text-ink-3">0</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cityRows.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-3">
            Nessuna città configurata. Aggiungile da <Link href="/impostazioni" className="text-brand">Impostazioni</Link>.
          </p>
        )}
      </Card>
    </>
  );
}
