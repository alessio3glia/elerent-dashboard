import { sendCase, setCaseExcluded } from "@/app/actions/recovery";
import { Card, Empty, PageHeader, StatTile } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { formatMetric } from "@/lib/metrics/catalog";
import {
  STAGE_LABEL,
  dueCases,
  emailConfig,
  getRecoverySettings,
  getScanState,
  openCases,
  recentEmails,
  recentRecovered,
  recoveredByStage,
  recoverySummary,
} from "@/lib/recovery";
import { SendDueForm, SettingsForm } from "./forms";

export const dynamic = "force-dynamic";

const when = (d: Date | null) => (d ? new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const day = (d: Date | null) => (d ? new Date(d).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short" }) : "—");

export default async function RecoveryPage() {
  const user = await requireUser();
  const settings = await getRecoverySettings();
  const [summary, byStage, cases, recovered, emails, due, scan] = await Promise.all([
    recoverySummary(),
    recoveredByStage(),
    openCases(200),
    recentRecovered(),
    recentEmails(),
    dueCases(settings, 1000),
    getScanState(),
  ]);
  const cfg = emailConfig();
  const rate = summary && summary.opened_90 > 0 ? summary.rec_90 / summary.opened_90 : null;

  return (
    <>
      <PageHeader
        title="Recupero corse non pagate"
        subtitle={`Debiti presi da Atom e ricontrollati a rotazione su tutti gli utenti${scan.lastCycleAt ? ` (ultimo giro completo ${when(new Date(scan.lastCycleAt))})` : ""}. Una pratica si chiude da sola quando il debito torna a zero.`}
      />

      {!cfg.ready && (
        <Card className="mb-6 border-warning/40">
          <p className="text-sm">
            <span className="font-medium text-warning">Email non ancora collegate.</span> Per inviare i solleciti servono su Vercel le variabili{" "}
            <code>RESEND_API_KEY</code> e <code>RECOVERY_FROM_EMAIL</code> (es. <code>Elerent &lt;pagamenti@elerent.com&gt;</code>), con il dominio verificato su Resend.
            Facoltativa <code>RECOVERY_REPLY_TO</code> per le risposte. Intanto la pagina mostra già debiti e pratiche.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Da recuperare" value={formatMetric(summary?.open_debt ?? 0, "eur")} hint={`${formatMetric(summary?.open_n ?? 0, "num")} utenti, ${formatMetric(summary?.never_emailed ?? 0, "num")} mai sollecitati`} />
        <StatTile label="Recuperato questo mese" value={formatMetric(summary?.rec_month ?? 0, "eur")} hint={`${formatMetric(summary?.rec_month_n ?? 0, "num")} utenti hanno pagato`} />
        <StatTile label="Tasso di recupero · 90 gg" value={rate === null ? "—" : formatMetric(rate, "pct")} hint="recuperato su debiti aperti negli ultimi 90 giorni" />
        <StatTile label="Email inviate questo mese" value={formatMetric(summary?.emails_month ?? 0, "num")} hint={`massimo ${settings.dailyLimit} al giorno`} />
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
        <Card title="Invia i solleciti in scadenza" className="xl:col-span-2">
          <p className="mb-4 text-sm text-ink-2">
            {due.length} utenti sono pronti per la prossima email ({settings.delayDays} giorni dalla precedente, debito di almeno {formatMetric(settings.minDebt, "eur")} ricontrollato nelle ultime 24 ore).
            {settings.auto ? " L'invio automatico è attivo: partono da sole ogni mattina." : " L'invio automatico è spento: partono solo da qui."}
          </p>
          <SendDueForm due={due.length} ready={cfg.ready} />
        </Card>
        <Card title="Quando pagano">
          <ul className="space-y-2 text-sm">
            {[0, 1, 2, 3].map((s) => {
              const r = byStage.find((b) => b.stage === s);
              return (
                <li key={s} className="flex justify-between gap-3">
                  <span className="text-ink-2">{s === 0 ? "Da soli, senza email" : `Dopo email ${STAGE_LABEL[s].slice(4)}`}</span>
                  <span className="tabular">{formatMetric(r?.amount ?? 0, "eur")} · {r?.n ?? 0}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card title={`Pratiche aperte · le ${cases.length} più alte`} className="mt-6 overflow-x-auto">
        {cases.length === 0 ? (
          <Empty>Nessun debito aperto. 🎉</Empty>
        ) : (
          <table className="table tabular">
            <thead>
              <tr>
                <th>Utente</th><th>Email</th><th>Città</th><th className="text-right">Debito</th><th>Aperta</th><th>Fase</th><th>Ultima email</th><th>Verificato</th><th />
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td>{c.name ?? `Utente ${c.customer_atom_id}`}</td>
                  <td className="text-ink-2">{c.email ?? <span className="text-critical">manca</span>}</td>
                  <td>{c.city ?? "—"}</td>
                  <td className="text-right font-medium text-critical">{formatMetric(c.debt ?? c.current_debt, "eur")}</td>
                  <td>{day(c.opened_at)}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs ${c.stage >= 3 ? "bg-critical/15 text-critical" : c.stage > 0 ? "bg-warning/15 text-warning" : "bg-surface-2 text-ink-3"}`}>{STAGE_LABEL[c.stage]}</span></td>
                  <td>{day(c.last_email_at)}</td>
                  <td className="text-ink-3">{when(c.updated_at)}</td>
                  <td className="whitespace-nowrap text-right">
                    {c.stage < 3 && cfg.ready && c.email && (
                      <form action={sendCase} className="inline">
                        <input type="hidden" name="id" value={c.id} />
                        <button className="text-xs text-brand hover:underline">Invia email {c.stage + 1}</button>
                      </form>
                    )}
                    <form action={setCaseExcluded} className="ml-3 inline">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="exclude" value="1" />
                      <button className="text-xs text-ink-3 hover:text-ink" title="Non sollecitare questo utente (es. contestazione in corso)">Escludi</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Card title="Ultimi recuperati" className="overflow-x-auto">
          {recovered.length === 0 ? <Empty>Ancora nessun recupero.</Empty> : (
            <table className="table tabular">
              <thead><tr><th>Utente</th><th className="text-right">Importo</th><th>Quando</th><th>Dopo</th></tr></thead>
              <tbody>
                {recovered.map((r) => (
                  <tr key={r.id}><td>{r.name ?? "—"}</td><td className="text-right text-brand">{formatMetric(r.recovered_amount, "eur")}</td><td>{day(r.closed_at)}</td><td className="text-ink-2">{STAGE_LABEL[r.stage]}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Storico email" className="overflow-x-auto">
          {emails.length === 0 ? <Empty>Nessuna email inviata.</Empty> : (
            <table className="table tabular">
              <thead><tr><th>Quando</th><th>A</th><th>Fase</th><th>Esito</th><th>Da</th></tr></thead>
              <tbody>
                {emails.map((e) => (
                  <tr key={e.id}>
                    <td>{when(e.sent_at)}</td>
                    <td className="text-ink-2">{e.email}</td>
                    <td>{e.stage}</td>
                    <td className={e.status === "errore" ? "text-critical" : "text-brand"} title={e.error ?? undefined}>{e.status}</td>
                    <td className="text-ink-3">{e.sent_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card title="Testi della sequenza e regole" className="mt-6">
        <SettingsForm settings={settings} isAdmin={user.role === "admin"} ready={cfg.ready} />
      </Card>
    </>
  );
}
