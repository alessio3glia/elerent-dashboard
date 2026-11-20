import { FleetMapLoader } from "@/components/fleet-map-loader";
import type { MapVehicle } from "@/components/fleet-map";
import { MonthCompareChart } from "@/components/month-compare-chart";
import { Card, Delta, Empty, StatTile } from "@/components/ui";
import type { Investor } from "@/lib/db/schema";
import { localDay } from "@/lib/dates";
import {
  EMPTY_TOTALS,
  dayLastYear,
  investorMonthly,
  investorShare,
  investorVehicles,
  onStreetDays,
  sumTotals,
  totalsByVehicle,
  uptime,
} from "@/lib/investors";
import { formatMetric } from "@/lib/metrics/catalog";
import { monthLabel, sameMonthLastYear } from "@/lib/metrics/monthly";

const change = (now: number, before: number | null | undefined) => (before ? (now - before) / before : null);
const eur = (v: number | null) => formatMetric(v, "eur");
const eur2 = (v: number | null) => formatMetric(v, "eur2");
const num = (v: number | null) => formatMetric(v, "num");
const DAY_MS = 86_400_000;

/** Stato attuale del veicolo, in parole semplici per l'investitore. */
function vehicleState(v: { on_air: boolean; battery: number | null; last_ride_at: Date | null; known: boolean }): MapVehicle["state"] {
  if (!v.known || !v.on_air) return "fuori";
  if (v.battery !== null && v.battery < 20) return "scarico";
  if (!v.last_ride_at || Date.now() - v.last_ride_at.getTime() > 3 * DAY_MS) return "fermo";
  return "ok";
}

const STATE: Record<MapVehicle["state"], { label: string; color: string }> = {
  ok: { label: "In strada", color: "#1fcb6e" },
  fermo: { label: "Senza corse da 3+ giorni", color: "#f2a93b" },
  scarico: { label: "Batteria sotto il 20%", color: "#f0524f" },
  fuori: { label: "Spento o fuori servizio", color: "#7c7c7c" },
};

/**
 * Pagina dell'investitore: solo i suoi veicoli, ricavo lordo delle loro corse e la sua quota,
 * sempre confrontati con lo stesso periodo dell'anno prima. La usano sia l'investitore sia l'admin (anteprima).
 */
export async function InvestorView({ investor }: { investor: Investor }) {
  const today = localDay();
  const monthStart = `${today.slice(0, 7)}-01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const lyToday = dayLastYear(today);

  const [vehicles, month, monthLy, ytd, ytdLy, allTime, monthly, street, streetLy] = await Promise.all([
    investorVehicles(investor.id),
    totalsByVehicle(investor.id, monthStart, today),
    totalsByVehicle(investor.id, dayLastYear(monthStart), lyToday),
    totalsByVehicle(investor.id, yearStart, today),
    totalsByVehicle(investor.id, dayLastYear(yearStart), lyToday),
    totalsByVehicle(investor.id, null, null),
    investorMonthly(investor.id),
    onStreetDays(investor.id, monthStart, today),
    onStreetDays(investor.id, dayLastYear(monthStart), lyToday),
  ]);

  if (vehicles.length === 0) {
    return <Empty>Non ci sono ancora veicoli associati a questo account. Contatta Elerent per completare l&apos;attivazione.</Empty>;
  }

  const share = (gross: number) => investorShare(gross, investor.sharePct);
  const hasShare = investor.sharePct !== null;
  const m = sumTotals(month);
  const mLy = sumTotals(monthLy);
  const y = sumTotals(ytd);
  const yLy = sumTotals(ytdLy);
  const all = sumTotals(allTime);
  const up = uptime(street);
  const upLy = uptime(streetLy);
  const dayN = Number(today.slice(8, 10));
  const periodHint = `1–${dayN} ${monthLabel(today.slice(0, 7))} contro gli stessi giorni dell'anno prima`;

  // Ultimi 12 mesi, ognuno con lo stesso mese dell'anno prima (— se non c'erano corse).
  const byMonth = new Map(monthly.map((r) => [r.month, r]));
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 15));
    months.push(d.toISOString().slice(0, 7));
  }
  const firstMonth = monthly[0]?.month;
  const prevOf = (mo: string, f: (r: { rides: number; revenue: number; km: number; vehicles: number }) => number) => {
    const ly = sameMonthLastYear(mo);
    if (!firstMonth || ly < firstMonth) return null;
    return f(byMonth.get(ly) ?? { rides: 0, revenue: 0, km: 0, vehicles: 0 });
  };
  // Mesi prima della prima corsa (storico non ancora importato o veicoli non ancora suoi) non si mostrano.
  const monthRows = months.filter((mo) => firstMonth && mo >= firstMonth).map((mo) => {
    const r = byMonth.get(mo) ?? { month: mo, rides: 0, km: 0, revenue: 0, vehicles: 0 };
    return { ...r, prevRevenue: prevOf(mo, (x) => x.revenue), prevRides: prevOf(mo, (x) => x.rides), prevKm: prevOf(mo, (x) => x.km) };
  });

  const placed = vehicles.filter((v) => v.lat !== null && v.lng !== null && (v.lat !== 0 || v.lng !== 0));
  const mapVehicles: MapVehicle[] = placed.map((v) => ({
    id: v.atom_id,
    number: v.number,
    lat: v.lat!,
    lng: v.lng!,
    state: vehicleState(v),
    battery: v.battery,
    status: v.status,
    lastRide: v.last_ride_at ? v.last_ride_at.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null,
  }));
  const center: [number, number] = placed.length
    ? [placed.reduce((a, v) => a + v.lat!, 0) / placed.length, placed.reduce((a, v) => a + v.lng!, 0) / placed.length]
    : [41.9, 12.5];

  const summary = [
    { label: "Corse", now: y.rides, before: yLy.rides, f: num },
    { label: "Km percorsi", now: y.km, before: yLy.km, f: num },
    { label: "Ricavo lordo", now: y.revenue, before: yLy.revenue, f: eur },
    ...(hasShare ? [{ label: `La tua quota (${investor.sharePct}%)`, now: share(y.revenue)!, before: share(yLy.revenue), f: eur }] : []),
    { label: "Veicoli con almeno una corsa", now: y.vehicles, before: yLy.vehicles, f: num },
  ];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Ricavo lordo del mese" value={eur(m.revenue)} delta={change(m.revenue, mLy.revenue)} hint={`Anno prima: ${mLy.rides ? eur(mLy.revenue) : "—"}`} accent={!hasShare} />
        {hasShare && (
          <StatTile label={`La tua quota del mese (${investor.sharePct}%)`} value={eur(share(m.revenue))} delta={change(share(m.revenue)!, share(mLy.revenue))} hint={`Anno prima: ${mLy.rides ? eur(share(mLy.revenue)) : "—"}`} accent />
        )}
        <StatTile label="Corse del mese" value={num(m.rides)} delta={change(m.rides, mLy.rides)} hint={`Anno prima: ${mLy.rides ? num(mLy.rides) : "—"}`} />
        <StatTile label="Km percorsi nel mese" value={num(m.km)} delta={change(m.km, mLy.km)} hint={`Anno prima: ${mLy.rides ? num(mLy.km) : "—"}`} />
        <StatTile label="Giorni in strada" value={formatMetric(up, "pct")} delta={up !== null && upLy ? (up - upLy) / upLy : null} hint={`Anno prima: ${formatMetric(upLy, "pct")}`} />
      </div>
      <p className="mt-2 text-xs text-ink-3">{periodHint}. Giorni in strada = giorni in cui il veicolo risultava disponibile ai clienti, sul totale dei giorni.</p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Ricavo lordo per mese · linea tratteggiata: anno prima">
          <MonthCompareChart data={monthRows.map((r) => ({ month: r.month, value: r.revenue, prev: r.prevRevenue }))} format="eur" label="Ricavo lordo" />
        </Card>
        <Card title="Corse per mese · linea tratteggiata: anno prima">
          <MonthCompareChart data={monthRows.map((r) => ({ month: r.month, value: r.rides, prev: r.prevRides }))} format="num" label="Corse" />
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={`Dall'inizio del ${today.slice(0, 4)} a oggi`}>
          <table className="table">
            <thead>
              <tr><th /><th className="text-right">{today.slice(0, 4)}</th><th className="text-right">Stesso periodo {Number(today.slice(0, 4)) - 1}</th><th className="text-right">Variazione</th></tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.label}>
                  <td>{s.label}</td>
                  <td className="tabular text-right">{s.f(s.now)}</td>
                  <td className="tabular text-right text-ink-2">{yLy.rides ? s.f(s.before ?? 0) : "—"}</td>
                  <td className="text-right"><Delta value={yLy.rides ? change(s.now, s.before) : null} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm text-ink-2">
            Dall&apos;inizio: <span className="tabular text-ink">{num(all.rides)}</span> corse, <span className="tabular text-ink">{num(all.km)}</span> km, ricavo lordo{" "}
            <span className="tabular text-ink">{eur2(all.revenue)}</span>
            {hasShare && (
              <>
                , tua quota <span className="tabular font-medium text-brand">{eur2(share(all.revenue))}</span>
              </>
            )}
            .
          </p>
        </Card>
        <Card title="Dove sono i tuoi veicoli · ultima posizione">
          {mapVehicles.length ? (
            <>
              <FleetMapLoader vehicles={mapVehicles} center={center} />
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-2">
                {(Object.keys(STATE) as MapVehicle["state"][]).map((k) => (
                  <span key={k} className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STATE[k].color }} />
                    {STATE[k].label} · {mapVehicles.filter((v) => v.state === k).length}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <Empty>Posizione non ancora disponibile.</Empty>
          )}
        </Card>
      </div>

      <Card title={`I tuoi veicoli · ${monthLabel(today.slice(0, 7))} contro lo stesso periodo dell'anno prima`} className="mt-6">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Veicolo</th>
                <th>Città</th>
                <th>Stato</th>
                <th className="text-right">Batteria</th>
                <th>Ultima corsa</th>
                <th className="text-right">Corse mese</th>
                <th className="text-right">Anno prima</th>
                <th className="text-right">Lordo mese</th>
                <th className="text-right">Anno prima</th>
                <th className="text-right">Var.</th>
                <th className="text-right">Km mese</th>
                <th className="text-right">Giorni in strada</th>
                <th className="text-right">Lordo totale</th>
                {hasShare && <th className="text-right">Tua quota totale</th>}
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const now = month.get(v.atom_id) ?? EMPTY_TOTALS;
                const ly = monthLy.get(v.atom_id);
                const tot = allTime.get(v.atom_id) ?? EMPTY_TOTALS;
                const st = street.get(v.atom_id);
                const state = STATE[vehicleState(v)];
                return (
                  <tr key={v.atom_id}>
                    <td className="font-medium">
                      {v.number ?? `#${v.atom_id}`}
                      {v.model && <div className="text-xs font-normal text-ink-3">{v.model}</div>}
                    </td>
                    <td className="text-ink-2">{v.city ?? "—"}</td>
                    <td>
                      <span className="flex items-center gap-1.5 whitespace-nowrap text-sm">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: state.color }} />
                        {state.label}
                      </span>
                    </td>
                    <td className="tabular text-right">{v.battery !== null ? `${v.battery}%` : "—"}</td>
                    <td className="whitespace-nowrap text-ink-2">
                      {v.last_ride_at ? v.last_ride_at.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", year: "numeric" }) : "mai"}
                    </td>
                    <td className="tabular text-right">{num(now.rides)}</td>
                    <td className="tabular text-right text-ink-2">{ly ? num(ly.rides) : "—"}</td>
                    <td className="tabular text-right">{eur2(now.revenue)}</td>
                    <td className="tabular text-right text-ink-2">{ly ? eur2(ly.revenue) : "—"}</td>
                    <td className="text-right"><Delta value={change(now.revenue, ly?.revenue)} /></td>
                    <td className="tabular text-right">{formatMetric(now.km, "num1")}</td>
                    <td className="tabular text-right">{st ? `${st.on_street}/${st.days}` : "—"}</td>
                    <td className="tabular text-right">{eur2(tot.revenue)}</td>
                    {hasShare && <td className="tabular text-right font-medium text-brand">{eur2(share(tot.revenue))}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Mese per mese · fino agli ultimi 12 mesi" className="mt-6">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Mese</th>
                <th className="text-right">Corse</th>
                <th className="text-right">Anno prima</th>
                <th className="text-right">Km</th>
                <th className="text-right">Anno prima</th>
                <th className="text-right">Ricavo lordo</th>
                <th className="text-right">Anno prima</th>
                <th className="text-right">Var.</th>
                {hasShare && <th className="text-right">Tua quota</th>}
                {hasShare && <th className="text-right">Anno prima</th>}
              </tr>
            </thead>
            <tbody>
              {[...monthRows].reverse().map((r) => (
                <tr key={r.month}>
                  <td className="whitespace-nowrap">{monthLabel(r.month)}{r.month === today.slice(0, 7) && <span className="text-xs text-ink-3"> · in corso</span>}</td>
                  <td className="tabular text-right">{num(r.rides)}</td>
                  <td className="tabular text-right text-ink-2">{num(r.prevRides)}</td>
                  <td className="tabular text-right">{num(r.km)}</td>
                  <td className="tabular text-right text-ink-2">{num(r.prevKm)}</td>
                  <td className="tabular text-right">{eur(r.revenue)}</td>
                  <td className="tabular text-right text-ink-2">{eur(r.prevRevenue)}</td>
                  <td className="text-right"><Delta value={change(r.revenue, r.prevRevenue)} /></td>
                  {hasShare && <td className="tabular text-right font-medium text-brand">{eur(share(r.revenue))}</td>}
                  {hasShare && <td className="tabular text-right text-ink-2">{r.prevRevenue === null ? "—" : eur(share(r.prevRevenue))}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-3">Il mese in corso è parziale e nella tabella si confronta con l&apos;intero mese dell&apos;anno prima; i riquadri in alto lo confrontano con gli stessi giorni. Ricavo lordo = prezzo delle corse dei tuoi veicoli, comprese quelle pagate con bonus o ancora in revisione.</p>
      </Card>
    </>
  );
}
