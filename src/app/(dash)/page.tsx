import Link from "next/link";
import { Card, Delta, PageHeader, PriorityBadge, StatTile } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { TrendChart } from "@/components/trend-chart";
import { LiveMapLoader } from "@/components/live-map-loader";
import { liveVehicles, recentRideEnds } from "@/lib/fleet-status";
import { getLiveState, todayByCity, todaySubscriptionsByCity } from "@/lib/live";
import { addDays, formatDay, localDay } from "@/lib/dates";
import { METRICS, formatMetric } from "@/lib/metrics/catalog";
import { inRange, sumByDay } from "@/lib/metrics/aggregate";
import { lastMetricDay, lastSync, listCities, metricsBetween, recentAlerts, tasksForDay } from "@/lib/queries";

const metric = (key: string) => METRICS.find((m) => m.key === key)!;
const change = (a: number | null, b: number | null) => (a !== null && b ? (a - b) / b : null);

export default async function OverviewPage() {
  const last = await lastMetricDay();
  const [cities, rows, alerts, todayTasks, sync, today, live, mapVehicles, rideEnds, todaySubs] = await Promise.all([
    listCities(),
    metricsBetween(addDays(last, -59), last),
    recentAlerts(1),
    tasksForDay(localDay()),
    lastSync(),
    todayByCity(),
    getLiveState(),
    liveVehicles(),
    recentRideEnds(30),
    todaySubscriptionsByCity(),
  ]);
  const subsToday = todaySubs.reduce((a, r) => ({ n: a.n + r.n, revenue: a.revenue + r.revenue }), { n: 0, revenue: 0 });
  const nowMs = Date.now();
  const mapRides = rideEnds.map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, price: r.price, minutesAgo: (nowMs - new Date(r.end_time).getTime()) / 60_000 }));
  const counts = { corsa: 0, operativo: 0, spento: 0 };
  for (const v of mapVehicles) counts[v.state]++;
  const todayTotal = today.reduce(
    (a, r) => ({ rides: a.rides + r.rides, revenue: a.revenue + r.revenue, vehicles: a.vehicles + r.vehicles }),
    { rides: 0, revenue: 0, vehicles: 0 },
  );
  const lastRide = today.map((r) => r.last_ride).filter((d): d is Date => !!d).sort((a, b) => +b - +a)[0];
  const todayRows = cities
    .map((c) => ({ city: c, ...(today.find((r) => r.city_id === c.id) ?? { rides: 0, revenue: 0, vehicles: 0 }) }))
    .filter((r) => r.rides > 0)
    .sort((a, b) => b.rides - a.rides);
  const time = (d: Date | string) => new Date(d).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
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

  if (rows.length === 0) {
    return (
      <>
        <PageHeader title="Panoramica rete" />
        <Card>
          <div className="py-10 text-center">
            <div className="text-lg font-medium">Ancora nessun dato</div>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">
              Importa lo storico da Atom: le città vengono create da sole in base a dove sono i veicoli, poi qui compaiono KPI, alert e task.
            </p>
            <Link href="/impostazioni" className="btn-primary mt-5">Vai all&apos;import</Link>
          </div>
        </Card>
      </>
    );
  }

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

      <AutoRefresh seconds={60} />
      <Card
        title={
          <>
            <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-brand" />
            Oggi, in tempo reale
          </>
        }
        action={
          <span className="text-xs text-ink-3">
            {live ? `aggiornato alle ${time(live.at)}` : "in attesa della prima sincronizzazione"}
            {lastRide && ` · ultima corsa ${time(lastRide)}`}
            {live?.error && <span className="text-critical"> · errore Atom: {live.error}</span>}
          </span>
        }
        className="mb-6"
      >
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          <div><div className="text-xs text-ink-3">Corse</div><div className="tabular text-3xl font-semibold">{formatMetric(todayTotal.rides, "num")}</div></div>
          <div><div className="text-xs text-ink-3">Fatturato</div><div className="tabular text-3xl font-semibold">{formatMetric(todayTotal.revenue, "eur")}</div></div>
          <div><div className="text-xs text-ink-3">Veicoli usati</div><div className="tabular text-3xl font-semibold">{formatMetric(todayTotal.vehicles, "num")}</div></div>
          <div>
            <div className="text-xs text-ink-3">Abbonamenti venduti</div>
            <div className="tabular text-3xl font-semibold">{formatMetric(subsToday.n, "num")}</div>
            {subsToday.revenue > 0 && <div className="tabular text-xs text-ink-3">{formatMetric(subsToday.revenue, "eur")}</div>}
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
            {todayRows.slice(0, 12).map((r) => (
              <Link key={r.city.id} href={`/citta/${r.city.slug}`} className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs hover:text-brand">
                {r.city.name} <span className="tabular text-ink-2">{r.rides} corse · {formatMetric(r.revenue, "eur")}</span>
              </Link>
            ))}
          </div>
        </div>
      </Card>

      <Card
        title="Mappa live della flotta"
        action={
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#39ff8f] shadow-[0_0_6px_#39ff8f]" />In corsa {counts.corsa}</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand" />Operativi {counts.operativo}</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#5a5a5a]" />Senza segnale {counts.spento}</span>
            <span>{mapRides.length} corse finite negli ultimi 30 min</span>
          </span>
        }
        className="mb-6"
      >
        <LiveMapLoader vehicles={mapVehicles} rides={mapRides} />
      </Card>

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
