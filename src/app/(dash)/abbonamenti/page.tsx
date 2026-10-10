import { Card, Delta, Empty, PageHeader, StatTile } from "@/components/ui";
import { localDay } from "@/lib/dates";
import { formatMetric } from "@/lib/metrics/catalog";
import { monthLabel, sameMonthLastYear } from "@/lib/metrics/monthly";
import { listCities } from "@/lib/queries";
import { getSubscriptionsState } from "@/lib/sync/subscriptions";
import { latestSubscriptions, subscriptionsByMonth, subscriptionsByPlan, subscriptionsTotal } from "@/lib/subscriptions-queries";

export const dynamic = "force-dynamic";

const prevMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

export default async function SubscriptionsPage() {
  const [cities, months, plans, latest, total, state] = await Promise.all([
    listCities({ all: true }),
    subscriptionsByMonth(),
    subscriptionsByPlan(),
    latestSubscriptions(),
    subscriptionsTotal(),
    getSubscriptionsState(),
  ]);
  const current = localDay().slice(0, 7);
  const previous = prevMonth(current);
  const cityName = (id: number | null) => cities.find((c) => c.id === id)?.name ?? "Città non trovata";
  const sum = (month: string, cityId?: number | null) =>
    months
      .filter((r) => r.month === month && (cityId === undefined || r.city_id === cityId))
      .reduce((a, r) => ({ n: a.n + r.n, revenue: a.revenue + r.revenue }), { n: 0, revenue: 0 });
  const now = sum(current);
  const before = sum(previous);
  const change = (a: number, b: number) => (b ? (a - b) / b : null);

  const cityIds = [...new Set(months.filter((r) => r.month === current || r.month === previous).map((r) => r.city_id))];
  const byCity = cityIds
    .map((id) => ({ id, now: sum(current, id), before: sum(previous, id) }))
    .sort((a, b) => b.now.revenue - a.now.revenue);
  const trend = [...new Set(months.map((r) => r.month))].sort().reverse();
  const time = (d: Date | null) => (d ? new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

  return (
    <>
      <PageHeader
        title="Abbonamenti"
        subtitle={
          state.lastError
            ? `Ultimo errore da Atom: ${state.lastError}`
            : state.done
              ? `${formatMetric(total?.n ?? 0, "num")} acquisti importati · aggiornati ogni pochi minuti`
              : `Import dello storico in corso: ${formatMetric(total?.n ?? 0, "num")} acquisti finora`
        }
      />

      {!total?.n ? (
        <Empty>Ancora nessun abbonamento importato. La sincronizzazione li scarica da Atom insieme alle corse.</Empty>
      ) : (
        <div className="grid gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label={`Venduti a ${monthLabel(current)}`} value={formatMetric(now.n, "num")} delta={change(now.n, before.n)} hint="mese in corso vs mese prima intero" />
            <StatTile label={`Incasso ${monthLabel(current)}`} value={formatMetric(now.revenue, "eur")} delta={change(now.revenue, before.revenue)} hint="mese in corso vs mese prima intero" />
            <StatTile label={`Venduti a ${monthLabel(previous)}`} value={formatMetric(before.n, "num")} />
            <StatTile label={`Incasso ${monthLabel(previous)}`} value={formatMetric(before.revenue, "eur")} />
          </div>

          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
            <Card title={`Per città · ${monthLabel(current)}`} className="overflow-x-auto">
              <table className="table tabular">
                <thead>
                  <tr><th>Città</th><th className="text-right">Venduti</th><th className="text-right">Incasso</th><th className="text-right">vs mese prima</th></tr>
                </thead>
                <tbody>
                  {byCity.map((r) => (
                    <tr key={r.id ?? "none"}>
                      <td>{cityName(r.id)}</td>
                      <td className="text-right">{formatMetric(r.now.n, "num")}</td>
                      <td className="text-right">{formatMetric(r.now.revenue, "eur")}</td>
                      <td className="text-right"><Delta value={change(r.now.revenue, r.before.revenue)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card title={`Per tipo di abbonamento · ${monthLabel(current)}`} className="overflow-x-auto">
              <table className="table tabular">
                <thead>
                  <tr><th>Abbonamento</th><th className="text-right">Venduti</th><th className="text-right">Incasso</th></tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.name ?? "none"}>
                      <td>{p.name ?? "Senza nome"}</td>
                      <td className="text-right">{formatMetric(p.n, "num")}</td>
                      <td className="text-right">{formatMetric(p.revenue, "eur")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {plans.length === 0 && <p className="py-4 text-sm text-ink-3">Nessun acquisto questo mese.</p>}
            </Card>
          </div>

          <Card title="Mese per mese" className="overflow-x-auto">
            <table className="table tabular">
              <thead>
                <tr><th>Mese</th><th className="text-right">Venduti</th><th className="text-right">Incasso</th><th className="text-right">vs anno prima</th></tr>
              </thead>
              <tbody>
                {trend.map((m) => {
                  const t = sum(m);
                  const ly = sum(sameMonthLastYear(m));
                  return (
                    <tr key={m}>
                      <td className="capitalize">{monthLabel(m)}</td>
                      <td className="text-right">{formatMetric(t.n, "num")}</td>
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
