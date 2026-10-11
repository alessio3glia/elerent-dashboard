import { Card, Delta, Empty, PageHeader, StatTile } from "@/components/ui";
import { localDay } from "@/lib/dates";
import { formatMetric } from "@/lib/metrics/catalog";
import { monthLabel, sameMonthLastYear } from "@/lib/metrics/monthly";
import { listCities } from "@/lib/queries";
import { getSubscriptionsState } from "@/lib/sync/subscriptions";
import { subscriptionsBetween } from "@/lib/revenue";
import { latestSubscriptions, subscriptionPlanRanking, subscriptionsByMonth, subscriptionsTotal } from "@/lib/subscriptions-queries";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const today = localDay();
  const current = today.slice(0, 7);
  const lyMonth = sameMonthLastYear(current);
  const [cities, months, plans, latest, total, state, lyMtd] = await Promise.all([
    listCities({ all: true }),
    subscriptionsByMonth(),
    subscriptionPlanRanking(),
    latestSubscriptions(),
    subscriptionsTotal(),
    getSubscriptionsState(),
    subscriptionsBetween(`${lyMonth}-01`, `${lyMonth}-${today.slice(8)}`),
  ]);
  const cityName = (id: number | null) => cities.find((c) => c.id === id)?.name ?? "Città non trovata";
  const sum = (month: string, cityId?: number | null) =>
    months
      .filter((r) => r.month === month && (cityId === undefined || r.city_id === cityId))
      .reduce((a, r) => ({ n: a.n + r.n, revenue: a.revenue + r.revenue }), { n: 0, revenue: 0 });
  /** Stessi giorni del mese, un anno fa. */
  const lySum = (cityId?: number | null) =>
    lyMtd.filter((r) => cityId === undefined || r.city_id === cityId).reduce((a, r) => ({ n: a.n + r.n, revenue: a.revenue + r.revenue }), { n: 0, revenue: 0 });
  const now = sum(current);
  const before = lySum();
  const change = (a: number, b: number) => (b ? (a - b) / b : null);
  const lyHint = `vs 1-${Number(today.slice(8))} ${monthLabel(lyMonth)}`;

  const cityIds = [...new Set([...months.filter((r) => r.month === current).map((r) => r.city_id), ...lyMtd.map((r) => r.city_id)])];
  const byCity = cityIds
    .map((id) => ({ id, now: sum(current, id), before: lySum(id) }))
    .sort((a, b) => b.now.revenue - a.now.revenue);
  const trend = [...new Set(months.map((r) => r.month))].sort().reverse().slice(0, 13);

  const named = plans.filter((p) => p.n_year > 0);
  const yearTotal = named.reduce((a, p) => a + p.n_year, 0);
  const best = named[0];
  const worst = named.length > 1 ? named.at(-1) : undefined;
  const time = (d: Date | null) => (d ? new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

  return (
    <>
      <PageHeader
        title="Abbonamenti"
        subtitle={
          state.lastError || state.history?.error
            ? `Ultimo errore da Atom: ${state.lastError ?? state.history?.error}`
            : state.done
              ? `${formatMetric(total?.n ?? 0, "num")} acquisti importati · aggiornati ogni pochi minuti`
              : `Import dello storico in corso: ${formatMetric(total?.n ?? 0, "num")} acquisti finora${state.history?.windowEnd ? `, arrivato al ${new Date(`${state.history.windowEnd}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}` : ""}`
        }
      />

      {!total?.n ? (
        <div className="grid gap-6">
          <Empty>Ancora nessun abbonamento importato. La sincronizzazione riprova da sola ogni pochi minuti.</Empty>
          {state.probes?.length ? (
            <Card title="Cosa risponde Atom (per l'assistenza)" className="overflow-x-auto">
              <ul className="space-y-2 text-xs text-ink-2">
                {state.probes.map((p, i) => (
                  <li key={i} className="break-all"><span className="text-ink">{p.endpoint} · {p.mode}</span>: {p.result}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label={`Venduti a ${monthLabel(current)}`} value={formatMetric(now.n, "num")} delta={change(now.n, before.n)} hint={`${lyHint}: ${formatMetric(before.n, "num")}`} />
            <StatTile label={`Incasso ${monthLabel(current)}`} value={formatMetric(now.revenue, "eur")} delta={change(now.revenue, before.revenue)} hint={`${lyHint}: ${formatMetric(before.revenue, "eur")}`} />
            <StatTile label="Il più venduto · 12 mesi" value={best?.name ?? "—"} delta={best ? change(best.n_year, best.n_year_ly) : undefined} hint={best ? `${formatMetric(best.n_year, "num")} venduti, vs 12 mesi prima` : undefined} />
            <StatTile label="Il meno venduto · 12 mesi" value={worst?.name ?? "—"} delta={worst ? change(worst.n_year, worst.n_year_ly) : undefined} hint={worst ? `${formatMetric(worst.n_year, "num")} venduti, vs 12 mesi prima` : undefined} />
          </div>

          <div className="grid grid-cols-1 items-start gap-6 2xl:grid-cols-2">
            <Card title={`Per città · ${monthLabel(current)} (anno prima: stessi giorni)`} className="overflow-x-auto">
              <table className="table tabular">
                <thead>
                  <tr><th>Città</th><th className="text-right">Venduti</th><th className="text-right">vs anno prima</th><th className="text-right">Incasso</th><th className="text-right">vs anno prima</th></tr>
                </thead>
                <tbody>
                  {byCity.map((r) => (
                    <tr key={r.id ?? "none"}>
                      <td>{cityName(r.id)}</td>
                      <td className="text-right">{formatMetric(r.now.n, "num")}</td>
                      <td className="text-right" title={`Anno prima: ${r.before.n}`}><Delta value={change(r.now.n, r.before.n)} /></td>
                      <td className="text-right">{formatMetric(r.now.revenue, "eur")}</td>
                      <td className="text-right" title={`Anno prima: ${formatMetric(r.before.revenue, "eur")}`}><Delta value={change(r.now.revenue, r.before.revenue)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card title="Classifica abbonamenti · dal più al meno venduto" className="overflow-x-auto">
              <table className="table tabular">
                <thead>
                  <tr>
                    <th>Abbonamento</th>
                    <th className="text-right">{monthLabel(current)}</th>
                    <th className="text-right">vs anno prima</th>
                    <th className="text-right">12 mesi</th>
                    <th className="text-right">Quota</th>
                    <th className="text-right">Incasso 12 mesi</th>
                    <th className="text-right">vs anno prima</th>
                  </tr>
                </thead>
                <tbody>
                  {named.map((p, i) => (
                    <tr key={p.name ?? "none"}>
                      <td>
                        {p.name ?? "Senza nome"}
                        {i === 0 && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">il più venduto</span>}
                        {named.length > 1 && i === named.length - 1 && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-3">il meno venduto</span>}
                      </td>
                      <td className="text-right">{formatMetric(p.n_month, "num")}</td>
                      <td className="text-right" title={`Stessi giorni anno prima: ${p.n_month_ly}`}><Delta value={change(p.n_month, p.n_month_ly)} /></td>
                      <td className="text-right font-medium">{formatMetric(p.n_year, "num")}</td>
                      <td className="text-right text-ink-2">{yearTotal ? `${Math.round((p.n_year / yearTotal) * 100)}%` : "—"}</td>
                      <td className="text-right">{formatMetric(p.rev_year, "eur")}</td>
                      <td className="text-right" title={`12 mesi prima: ${formatMetric(p.rev_year_ly, "eur")}`}><Delta value={change(p.rev_year, p.rev_year_ly)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {named.length === 0 && <p className="py-4 text-sm text-ink-3">Nessun acquisto negli ultimi 12 mesi.</p>}
            </Card>
          </div>

          <Card title="Mese per mese" className="overflow-x-auto">
            <table className="table tabular">
              <thead>
                <tr><th>Mese</th><th className="text-right">Venduti</th><th className="text-right">vs anno prima</th><th className="text-right">Incasso</th><th className="text-right">vs anno prima</th></tr>
              </thead>
              <tbody>
                {trend.map((m) => {
                  const t = sum(m);
                  const ly = m === current ? before : sum(sameMonthLastYear(m));
                  return (
                    <tr key={m}>
                      <td className="capitalize">{monthLabel(m)}{m === current && <span className="ml-2 text-xs text-ink-3">in corso, vs stessi giorni</span>}</td>
                      <td className="text-right">{formatMetric(t.n, "num")}</td>
                      <td className="text-right"><Delta value={change(t.n, ly.n)} /></td>
                      <td className="text-right">{formatMetric(t.revenue, "eur")}</td>
                      <td className="text-right"><Delta value={change(t.revenue, ly.revenue)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card title="Ultimi acquisti" className="overflow-x-auto">
            <table className="table tabular">
              <thead>
                <tr><th>Quando</th><th>Città</th><th>Abbonamento</th><th className="text-right">Prezzo</th><th>Scade</th><th className="text-right">Utente</th></tr>
              </thead>
              <tbody>
                {latest.map((s) => (
                  <tr key={s.id}>
                    <td>{time(s.purchased_at)}</td>
                    <td>{cityName(s.city_id)}</td>
                    <td>{s.name ?? "—"}</td>
                    <td className="text-right">{formatMetric(s.price, "eur")}</td>
                    <td>{time(s.ends_at)}</td>
                    <td className="text-right text-ink-3">{s.customer_atom_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </>
  );
}
