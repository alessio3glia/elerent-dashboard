import Link from "next/link";
import { sql } from "drizzle-orm";
import { AutoRefresh } from "@/components/auto-refresh";
import { HeatMapLoader } from "@/components/heat-map-loader";
import { AvailabilityChart, PaceChart } from "@/components/hour-charts";
import { Card, Empty, PageHeader, StatTile } from "@/components/ui";
import { availabilityByHour } from "@/lib/availability";
import { db } from "@/lib/db";
import { liveVehicles } from "@/lib/fleet-status";
import { SLOTS, heatCells, hotCells, inCell, meters, rebalancingZones, type Slot } from "@/lib/heatmap";
import { listCities } from "@/lib/queries";
import { freshness, hourlyToday, paceByCity, paceDelta } from "@/lib/realtime";
import { Freshness } from "../freshness";

const PERIODS = [7, 30, 90] as const;

export default async function HeatmapPage({ searchParams }: PageProps<"/heatmap">) {
  const sp = await searchParams;
  const cities = await listCities();
  const days = PERIODS.includes(Number(sp.giorni) as (typeof PERIODS)[number]) ? Number(sp.giorni) : 30;
  const slot = (String(sp.fascia) in SLOTS ? sp.fascia : "tutte") as Slot;

  // Città predefinita: quella con più corse negli ultimi 30 giorni
  let city = cities.find((c) => c.slug === sp.citta);
  if (!city && cities.length) {
    const [top] = await db.execute<{ city_id: number }>(sql`
      select city_id from rides where start_time >= now() - interval '30 days' and city_id is not null
      group by city_id order by count(*) desc limit 1`);
    city = cities.find((c) => c.id === top?.city_id) ?? cities[0];
  }
  const href = (patch: Record<string, string>) =>
    `/heatmap?${new URLSearchParams({ ...(city ? { citta: city.slug } : {}), giorni: String(days), fascia: slot, ...patch })}`;

  if (!city) {
    return (
      <>
        <PageHeader title="Heatmap" />
        <Card><Empty>Nessuna città attiva.</Empty></Card>
      </>
    );
  }

  const allVehicles = await liveVehicles();
  const vehicles = allVehicles.filter((v) => v.cityId === city.id);
  const centerLat = city.centerLat ?? vehicles[0]?.lat ?? 41.9;
  const [cells, zonesRaw, availability, pace, hourly, fresh] = await Promise.all([
    heatCells(city.id, centerLat, days, slot),
    rebalancingZones(),
    availabilityByHour(city.id),
    paceByCity(),
    hourlyToday(city.id),
    freshness(),
  ]);

  // Zone calde: le celle dove parte metà delle corse. Quanti mezzi disponibili ci sono adesso?
  const hot = hotCells(cells);
  const hotKeys = new Set(hot.map((c) => `${c.lat}:${c.lng}`));
  const available = vehicles.filter((v) => v.state === "operativo");
  const availableInHot = available.filter((v) => hot.some((c) => inCell(v, c))).length;
  const hotShare = available.length ? availableInHot / available.length : null;
  const departures = cells.reduce((s, c) => s + c.dep, 0);
  const arrivals = cells.reduce((s, c) => s + c.arr, 0);

  // Zone di riequilibrio Atom di questa città, con i mezzi con segnale che ci sono adesso.
  const center = city.centerLat !== null && city.centerLng !== null ? { lat: city.centerLat, lng: city.centerLng } : null;
  const zones = zonesRaw.zones
    .filter((z) => (center ? meters(center, z) <= (city.radiusKm ?? 15) * 1300 : vehicles.some((v) => meters(v, z) < 2000)))
    .map((z) => ({ ...z, present: vehicles.filter((v) => v.state !== "spento" && meters(v, z) <= z.radius).length }))
    .sort((a, b) => a.present - a.target - (b.present - b.target));
  const zonesShort = zones.filter((z) => z.present < z.target);

  const p = pace.find((r) => r.city_id === city.id);
  const delta = p ? paceDelta(p.today, p.week1) : null;

  return (
    <>
      <PageHeader
        title="Heatmap"
        subtitle="Dove partono e arrivano le corse, dove sono i mezzi adesso e se il riposizionamento segue la domanda."
      >
        <Freshness data={fresh} />
      </PageHeader>
      <AutoRefresh seconds={60} />

      <div className="mb-3 flex flex-wrap gap-2">
        {cities.map((c) => (
          <Link key={c.id} href={href({ citta: c.slug })} className={`rounded-lg px-3 py-1.5 text-sm ${city.id === c.id ? "bg-brand-soft font-medium text-brand" : "text-ink-3 hover:text-ink"}`}>{c.name}</Link>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        {PERIODS.map((d) => (
          <Link key={d} href={href({ giorni: String(d) })} className={`rounded-lg px-3 py-1.5 ${days === d ? "bg-surface-2" : "text-ink-3 hover:text-ink"}`}>Ultimi {d} giorni</Link>
        ))}
        <span className="mx-2 h-5 w-px bg-line" />
        {(Object.keys(SLOTS) as Slot[]).map((s) => (
          <Link key={s} href={href({ fascia: s })} className={`rounded-lg px-3 py-1.5 ${slot === s ? "bg-surface-2" : "text-ink-3 hover:text-ink"}`}>{SLOTS[s].label}</Link>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Corse oggi" value={String(p?.today ?? 0)} delta={delta} hint="contro lo stesso giorno della settimana scorsa alla stessa ora" />
        <StatTile label={`Partenze · arrivi (${days} gg)`} value={`${departures.toLocaleString("it-IT")} · ${arrivals.toLocaleString("it-IT")}`} />
        <StatTile
          label="Mezzi disponibili nelle zone calde"
          value={hotShare === null ? "—" : `${Math.round(hotShare * 100)}%`}
          hint={`${availableInHot} su ${available.length} disponibili sono dove parte metà delle corse (${hot.length} celle da 200 m)`}
        />
        <StatTile
          label="Zone di riequilibrio sotto obiettivo"
          value={zones.length ? `${zonesShort.length} su ${zones.length}` : "—"}
          hint={zones.length ? "zone impostate in Atom con meno mezzi del previsto" : zonesRaw.error ? "Atom non ha risposto" : "nessuna zona impostata in Atom per questa città"}
        />
      </div>

      <Card title={`${city.name} · ${SLOTS[slot].label.toLowerCase()} · ultimi ${days} giorni`}>
        {cells.length === 0 && vehicles.length === 0 ? (
          <Empty>Nessuna corsa con posizione in questo periodo.</Empty>
        ) : (
          <HeatMapLoader
            key={`${city.id}-${days}-${slot}`}
            cells={cells.map((c) => ({ ...c, hot: hotKeys.has(`${c.lat}:${c.lng}`) }))}
            vehicles={vehicles}
            zones={zones}
          />
        )}
        <p className="mt-3 text-xs text-ink-3">
          Gli arrivi sono il punto di fine corsa registrato da Atom. Atom non dà il punto di partenza: si usa dove il mezzo era stato lasciato dalla corsa
          precedente, quindi un mezzo spostato da un operatore risulta partito dal punto vecchio. I mezzi si aggiornano ogni minuto.
        </p>
      </Card>

      {zones.length > 0 && (
        <Card className="mt-6" title="Zone di riequilibrio Atom: obiettivo e mezzi presenti adesso">
          <div className="overflow-x-auto">
            <table className="table tabular">
              <thead>
                <tr><th>Zona</th><th className="text-right">Obiettivo</th><th className="text-right">Presenti ora</th><th className="text-right">Differenza</th></tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.id}>
                    <td>{z.title}</td>
                    <td className="text-right">{z.target}</td>
                    <td className="text-right">{z.present}</td>
                    <td className={`text-right ${z.present < z.target ? "text-critical" : "text-brand"}`}>{z.present - z.target > 0 ? "+" : ""}{z.present - z.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title={`Ritmo di oggi a ${city.name}: corse cumulate ora per ora`}>
          <PaceChart data={hourly} />
        </Card>
        <Card title="Mezzi disponibili e corse per fascia oraria (media ultimi 14 giorni)">
          {availability.samples === 0 ? (
            <Empty>La disponibilità si registra ogni 15 minuti da oggi: il grafico si riempie nei prossimi giorni.</Empty>
          ) : (
            <AvailabilityChart data={availability.hours} />
          )}
          <p className="mt-3 text-xs text-ink-3">
            Disponibili = in strada, con segnale, fermi e con batteria almeno al 15%. Se nelle ore con più corse la linea scende, mancano mezzi pronti
            proprio quando servono.
          </p>
        </Card>
      </div>
    </>
  );
}
