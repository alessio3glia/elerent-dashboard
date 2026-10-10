import Link from "next/link";
import { Card, Empty, PageHeader } from "@/components/ui";
import { SEGMENTS, customersInSegment, registeredCustomers, segmentSummary, type Segment } from "@/lib/customers";
import { formatMetric } from "@/lib/metrics/catalog";
import { listCities } from "@/lib/queries";

export default async function CustomersPage({ searchParams }: PageProps<"/utenti">) {
  const sp = await searchParams;
  const segment = (Object.keys(SEGMENTS).includes(String(sp.segmento)) ? sp.segmento : "in_calo") as Segment;
  const cities = await listCities({ all: true });
  const city = cities.find((c) => c.slug === sp.citta);
  const [summary, list, registered] = await Promise.all([segmentSummary(city?.id), customersInSegment(segment, city?.id), registeredCustomers()]);
  const withRides = summary.filter((s) => s.segment !== "mai_attivi").reduce((a, s) => a + s.customers, 0);
  const bySegment = new Map(summary.map((s) => [s.segment, s]));
  const href = (patch: Record<string, string>) =>
    `/utenti?${new URLSearchParams({ segmento: segment, ...(city ? { citta: city.slug } : {}), ...patch })}`;

  return (
    <>
      <PageHeader
        title="Utenti"
        subtitle="Clienti divisi per comportamento, con l'azione suggerita per aumentare la spesa. La città è quella dell'ultima corsa."
      >
        <div className="text-right text-sm text-ink-2">
          <div className="tabular text-2xl font-semibold text-ink">{formatMetric(registered, "num")}</div>
          registrati importati · {formatMetric(withRides, "num")} con almeno una corsa{city ? ` a ${city.name}` : ""}
        </div>
      </PageHeader>
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={`/utenti?segmento=${segment}`} className={`rounded-lg px-3 py-1.5 text-sm ${!city ? "bg-surface-2" : "text-ink-3 hover:text-ink"}`}>Tutte le città</Link>
        {cities.map((c) => (
          <Link key={c.id} href={href({ citta: c.slug })} className={`rounded-lg px-3 py-1.5 text-sm ${city?.id === c.id ? "bg-surface-2" : "text-ink-3 hover:text-ink"}`}>{c.name}</Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-7">
        {(Object.keys(SEGMENTS) as Segment[]).map((key) => {
          const s = bySegment.get(key);
          return (
            <Link key={key} href={href({ segmento: key })}>
              <div className={`h-full rounded-xl border bg-surface p-4 transition-colors ${key === segment ? "border-brand" : "border-line hover:border-ink-3"}`}>
                <div className="text-sm text-ink-2">{SEGMENTS[key].label}</div>
                <div className="tabular mt-1 text-2xl font-semibold">{formatMetric(s?.customers ?? 0, "num")}</div>
                <div className="tabular text-xs text-ink-3">{formatMetric(s?.spend_30 ?? 0, "eur")} negli ultimi 30 gg</div>
              </div>
            </Link>
          );
        })}
      </div>

      <Card className="mt-6" title={`${SEGMENTS[segment].label}: ${SEGMENTS[segment].description}`}>
        <p className="mb-4 rounded-lg bg-brand-soft px-4 py-3 text-sm">
          <span className="font-medium text-brand">Notifica suggerita:</span> {SEGMENTS[segment].push}
        </p>
        <div className="overflow-x-auto">
          <table className="table tabular">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Città</th>
                <th className="text-right">Spesa totale</th>
                <th className="text-right">Corse totali</th>
                <th className="text-right">Corse 30 gg</th>
                <th className="text-right">30 gg prima</th>
                <th className="text-right">Ultima corsa</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div>{c.name ?? `Cliente ${c.id}`}</div>
                    <div className="text-xs text-ink-3">{[c.email, c.phone].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td>{c.city_name ?? "—"}</td>
                  <td className="text-right">{formatMetric(c.spend_total, "eur")}</td>
                  <td className="text-right">{c.rides_total}</td>
                  <td className="text-right">{c.rides_30}</td>
                  <td className="text-right">{c.rides_prev_30}</td>
                  <td className="text-right">{c.last_ride ? new Date(c.last_ride).toLocaleDateString("it-IT") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.length === 0 && <Empty>Nessun cliente in questo gruppo.</Empty>}
        <p className="mt-3 text-xs text-ink-3">Primi 50 per spesa totale: sono quelli che vale di più trattenere o riattivare.</p>
      </Card>
    </>
  );
}
