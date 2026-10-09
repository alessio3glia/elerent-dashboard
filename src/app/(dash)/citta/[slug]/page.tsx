import Link from "next/link";
import { notFound } from "next/navigation";
import { FleetMapLoader } from "@/components/fleet-map-loader";
import type { MapVehicle } from "@/components/fleet-map";
import { TrendChart } from "@/components/trend-chart";
import { Card, Empty, PageHeader, PriorityBadge, SeverityBadge, StatTile } from "@/components/ui";
import { isOnStreet } from "@/lib/atom/parse";
import { addDays, formatDay } from "@/lib/dates";
import { METRICS, formatMetric } from "@/lib/metrics/catalog";
import { cityVehicles, getCity, lastMetricDay, metricsBetween, recentAlerts, tasksForCity } from "@/lib/queries";

const CHARTS = ["revenue", "activeVehicles", "ridesPerVehicle", "idleVehicles"];
const metric = (key: string) => METRICS.find((m) => m.key === key)!;

export default async function CityPage({ params }: PageProps<"/citta/[slug]">) {
  const { slug } = await params;
  const city = await getCity(slug);
  if (!city) notFound();
  const last = await lastMetricDay();
  const [rows, alerts, tasks, fleet] = await Promise.all([
    metricsBetween(addDays(last, -59), last, [city.id]),
    recentAlerts(14, city.id),
    tasksForCity(city.id),
    cityVehicles(city.id),
  ]);
  const w = rows.filter((r) => r.day > addDays(last, -7));
  const pw = rows.filter((r) => r.day <= addDays(last, -7) && r.day > addDays(last, -14));
  const tile = (key: string) => {
    const m = metric(key);
    const a = m.total(w);
    const b = m.total(pw);
    return <StatTile key={key} label={`${m.label} · 7 gg`} value={formatMetric(a, m.format)} delta={a !== null && b ? (a - b) / b : null} higherIsBetter={m.higherIsBetter} />;
  };

  // "Fermo" rispetto al momento della foto: nessuna corsa nei 3 giorni prima
  const idleSince = (updatedAt: Date) => updatedAt.getTime() - 3 * 86_400_000;
  const mapVehicles: MapVehicle[] = fleet
    .filter((v) => v.lat !== null && v.lng !== null)
    .map((v) => ({
      id: v.atomId,
      number: v.number,
      lat: v.lat!,
      lng: v.lng!,
      battery: v.battery,
      status: v.status,
      lastRide: v.lastRideAt ? v.lastRideAt.toLocaleDateString("it-IT") : null,
      state: !isOnStreet(v.status)
        ? "fuori"
        : v.battery !== null && v.battery < 20
          ? "scarico"
          : !v.lastRideAt || v.lastRideAt.getTime() < idleSince(v.updatedAt)
            ? "fermo"
            : "ok",
    }));
  const counts = mapVehicles.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v.state]: (acc[v.state] ?? 0) + 1 }), {});
  const center: [number, number] = [city.centerLat ?? mapVehicles[0]?.lat ?? 41.9, city.centerLng ?? mapVehicles[0]?.lng ?? 12.5];

  return (
    <>
      <PageHeader
        title={city.name}
        subtitle={
          <>
            {city.affiliateName ?? "Affiliato non indicato"}
            {city.contactName && ` · ${city.contactName}`}
            {city.contactPhone && (
              <> · <a className="text-brand hover:underline" href={`tel:${city.contactPhone.replace(/\s/g, "")}`}>{city.contactPhone}</a></>
            )}
            {` · ultimo contatto ${city.lastContactAt ? city.lastContactAt.toLocaleDateString("it-IT") : "mai registrato"}`}
          </>
        }
      >
        <Link href={`/analytics?citta=${city.slug}`} className="btn-secondary">Analytics della città</Link>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {["revenue", "elerentRevenue", "rides", "ridesPerVehicle"].map(tile)}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {CHARTS.map((key) => {
          const m = metric(key);
          return (
            <Card key={key} title={`${m.label} · 60 giorni`}>
              <TrendChart label={m.label} format={m.format} height={200} data={rows.map((r) => ({ day: r.day, value: m.daily(r) }))} />
            </Card>
          );
        })}
      </div>

      <Card title="Mappa flotta · posizione all'ultima sincronizzazione" className="mt-6">
        {mapVehicles.length ? (
          <>
            <FleetMapLoader vehicles={mapVehicles} center={center} />
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-2">
              {[
                ["ok", "#1fcb6e", "In strada"],
                ["fermo", "#f2a93b", "Senza corse da 3+ giorni"],
                ["scarico", "#f0524f", "Batteria sotto il 20%"],
                ["fuori", "#7c7c7c", "Fuori servizio"],
              ].map(([k, color, label]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                  {label} · {counts[k] ?? 0}
                </span>
              ))}
            </div>
          </>
        ) : (
          <Empty>Nessuna posizione disponibile: compare dopo la prima sincronizzazione con Atom.</Empty>
        )}
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Alert · 14 giorni">
          <ul className="divide-y divide-line">
            {alerts.map(({ alert }) => (
              <li key={alert.id} className="py-3">
                <div className="flex items-center gap-2 text-xs text-ink-3"><SeverityBadge severity={alert.severity} /> {formatDay(alert.day)}</div>
                <div className="mt-1 text-sm">{alert.title}</div>
                <div className="text-xs text-ink-2">{alert.detail}</div>
              </li>
            ))}
          </ul>
          {alerts.length === 0 && <Empty>Nessun alert.</Empty>}
        </Card>
        <Card title="Storico task e contatti">
          <ul className="divide-y divide-line">
            {tasks.map((t) => (
              <li key={t.id} className="py-3">
                <div className="flex items-center gap-2 text-xs text-ink-3">
                  <PriorityBadge priority={t.priority} /> {formatDay(t.day)} · {t.status}
                  {t.completedBy && ` da ${t.completedBy}`}
                </div>
                <div className="mt-1 text-sm">{t.title}</div>
                {t.note && <div className="text-xs text-ink-2">“{t.note}”</div>}
              </li>
            ))}
          </ul>
          {tasks.length === 0 && <Empty>Nessuna task.</Empty>}
        </Card>
      </div>
    </>
  );
}
