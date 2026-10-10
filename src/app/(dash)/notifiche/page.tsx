import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Card, Empty, PageHeader } from "@/components/ui";
import { SEGMENTS, segmentRecipients, type Segment } from "@/lib/customers";
import { db, schema } from "@/lib/db";
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
  const [rows, history] = await Promise.all([
    segmentRecipients(segment, city?.id),
    db
      .select({ n: schema.notifications, city: schema.cities.name })
      .from(schema.notifications)
      .leftJoin(schema.cities, eq(schema.cities.id, schema.notifications.cityId))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(30),
  ]);
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
          suggestions={suggestionsFor(segment, city?.name)}
          enabled={cfg.configured}
        />
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
