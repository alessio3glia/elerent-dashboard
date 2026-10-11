import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Card, Delta, Empty, PageHeader } from "@/components/ui";
import { SEGMENTS, segmentRecipients, type Segment } from "@/lib/customers";
import { db, schema } from "@/lib/db";
import { formatMetric } from "@/lib/metrics/catalog";
import { bestNotification, EFFECT_HOURS, notificationEffects, responseRate } from "@/lib/notification-effect";
import { suggestionsFor } from "@/lib/notification-suggestions";
import { oneSignalConfig } from "@/lib/onesignal";
import { listCities } from "@/lib/queries";
import { Composer } from "./composer";

const FIELD_LABEL = { atom_id: "ID utente Atom", email: "email", phone: "telefono" } as const;

export default async function NotificationsPage({ searchParams }: PageProps<"/notifiche">) {
  const sp = await searchParams;
  const segment = (Object.keys(SEGMENTS).includes(String(sp.segmento)) ? sp.segmento : "in_calo") as Segment;
  const cities = await listCities();
  const city = cities.find((c) => c.slug === sp.citta);
  const cfg = oneSignalConfig();
  const [rows, history, effects] = await Promise.all([
    segmentRecipients(segment, city?.id),
    db
      .select({ n: schema.notifications, city: schema.cities.name })
      .from(schema.notifications)
      .leftJoin(schema.cities, eq(schema.cities.id, schema.notifications.cityId))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(30),
    notificationEffects(),
  ]);
  const best = bestNotification(effects);
  const recipients = new Set(rows.map((r) => (cfg.externalIdField === "atom_id" ? String(r.id) : r[cfg.externalIdField])).filter(Boolean)).size;
  const href = (patch: Record<string, string>) =>
    `/notifiche?${new URLSearchParams({ segmento: segment, ...(city ? { citta: city.slug } : {}), ...patch })}`;

  return (
    <>
      <PageHeader
        title="Notifiche"
        subtitle="Scegli il gruppo di utenti, parti da un testo suggerito, prova sul tuo telefono e invia tramite OneSignal."
      />
      {!cfg.configured && (
        <p className="mb-6 rounded-lg border border-warning px-4 py-3 text-sm">
          OneSignal non è ancora collegato: un amministratore deve aggiungere <code>ONESIGNAL_APP_ID</code> e <code>ONESIGNAL_REST_API_KEY</code> nelle
          variabili d&apos;ambiente di Vercel. Puoi già preparare i testi.
        </p>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {(Object.keys(SEGMENTS) as Segment[]).map((key) => (
          <Link key={key} href={href({ segmento: key })} className={`rounded-lg px-3 py-1.5 text-sm ${key === segment ? "bg-brand-soft font-medium text-brand" : "text-ink-3 hover:text-ink"}`}>
            {SEGMENTS[key].label}
          </Link>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={`/notifiche?segmento=${segment}`} className={`rounded-lg px-3 py-1.5 text-sm ${!city ? "bg-surface-2" : "text-ink-3 hover:text-ink"}`}>Tutte le città</Link>
        {cities.map((c) => (
          <Link key={c.id} href={href({ citta: c.slug })} className={`rounded-lg px-3 py-1.5 text-sm ${city?.id === c.id ? "bg-surface-2" : "text-ink-3 hover:text-ink"}`}>{c.name}</Link>
        ))}
      </div>

      <Card title={`${SEGMENTS[segment].label}${city ? ` · ${city.name}` : ""}: ${SEGMENTS[segment].description}`}>
        <p className="mb-4 text-sm text-ink-2">
          Obiettivo: {SEGMENTS[segment].push} Destinatari: <b className="text-ink">{recipients.toLocaleString("it-IT")}</b> utenti
          (riconosciuti in OneSignal per {FIELD_LABEL[cfg.externalIdField]}). Ricevono la notifica solo quelli con le notifiche attive nell&apos;app.
        </p>
        <Composer
          key={`${segment}-${city?.id ?? "tutte"}`}
          segment={segment}
          cityId={city?.id}
          recipients={recipients}
          cityName={city?.name}
          suggestions={suggestionsFor(segment, city?.name).slice(0, 3)}
          enabled={cfg.configured}
          aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
        />
      </Card>

      <Card className="mt-6" title="Effetto delle notifiche">
        <p className="mb-4 text-sm text-ink-2">
          Cosa hanno fatto i destinatari nei {EFFECT_HOURS / 24} giorni dopo l&apos;invio, confrontato con gli stessi giorni della settimana prima
          (stessi utenti, stesso giorno della settimana). Così si vede quali testi e quali gruppi rispondono davvero.
        </p>
        {effects.length === 0 ? (
          <Empty>Ancora nessuna notifica reale da misurare: l&apos;effetto compare qui dopo il primo invio.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table tabular">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Messaggio</th>
                  <th className="text-right">Destinatari</th>
                  <th className="text-right">Tornati in sella</th>
                  <th className="text-right">Corse</th>
                  <th className="text-right">Ricavo corse</th>
                  <th className="text-right">Abbonamenti</th>
                </tr>
              </thead>
              <tbody>
                {effects.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">
                      {e.created_at.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })}
                      {e.running && <div className="text-xs text-warning">in corso, dati parziali</div>}
                    </td>
                    <td>
                      <div className="font-medium">
                        {e.title}
                        {e.id === best && <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-brand">funziona meglio</span>}
                      </div>
                      <div className="text-xs text-ink-3">{SEGMENTS[e.segment as Segment]?.label ?? e.segment}{e.city ? ` · ${e.city}` : ""}</div>
                    </td>
                    {e.tracked === 0 ? (
                      <td colSpan={5} className="text-sm text-ink-3">
                        Non misurabile: inviata a {e.recipients} utenti prima che la dashboard salvasse l&apos;elenco dei destinatari.
                      </td>
                    ) : (
                      <>
                        <td className="text-right">{formatMetric(e.tracked, "num")}</td>
                        <td className="text-right">
                          <Compare after={e.riders} before={e.riders_before} format="num" />
                          <div className="text-xs text-ink-3">{formatMetric(responseRate(e.riders, e.tracked), "pct")} dei destinatari</div>
                        </td>
                        <td className="text-right"><Compare after={e.rides} before={e.rides_before} format="num" /></td>
                        <td className="text-right"><Compare after={e.revenue} before={e.revenue_before} format="eur" /></td>
                        <td className="text-right">
                          <Compare after={e.subs} before={e.subs_before} format="num" />
                          {e.subs > 0 && <div className="text-xs text-ink-3">{formatMetric(e.subs_revenue, "eur")}</div>}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6" title="Ultimi invii">
        {history.length === 0 ? (
          <Empty>Nessuna notifica inviata finora.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table tabular">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Gruppo</th>
                  <th>Messaggio</th>
                  <th className="text-right">Destinatari</th>
                  <th>Esito</th>
                  <th>Inviata da</th>
                </tr>
              </thead>
              <tbody>
                {history.map(({ n, city: cityName }) => (
                  <tr key={n.id}>
                    <td>{n.createdAt.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })}</td>
                    <td>{SEGMENTS[n.segment as Segment]?.label ?? n.segment}{cityName ? ` · ${cityName}` : ""}</td>
                    <td>
                      <div className="font-medium">{n.title}</div>
                      <div className="text-xs text-ink-3">{n.body}</div>
                    </td>
                    <td className="text-right">{n.test ? "Prova" : n.recipients}</td>
                    <td className={n.status === "errore" ? "text-critical" : ""} title={n.error ?? undefined}>
                      {n.status === "inviata" ? "Inviata" : n.status === "errore" ? "Errore" : "In invio"}
                      {n.error && <div className="text-xs text-ink-3">{n.error}</div>}
                    </td>
                    <td>{n.sentBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/** Valore dopo l'invio, con il confronto con la settimana prima. */
function Compare({ after, before, format }: { after: number; before: number; format: "num" | "eur" }) {
  return (
    <div>
      <div className="font-medium">{formatMetric(after, format)}</div>
      <div className="flex items-center justify-end gap-2 text-xs text-ink-3">
        <span>sett. prima {formatMetric(before, format)}</span>
        {before > 0 ? <Delta value={(after - before) / before} /> : after > 0 ? <span className="font-medium text-brand">nuovo</span> : null}
      </div>
    </div>
  );
}
