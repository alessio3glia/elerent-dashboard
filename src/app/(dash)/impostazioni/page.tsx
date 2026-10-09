import { asc } from "drizzle-orm";
import { deleteUser, importHistory, recompute } from "@/app/actions/settings";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { lastSync, listCities } from "@/lib/queries";
import { getBackfillState } from "@/lib/sync/sync";

// L'import dello storico lavora a blocchi di circa 4 minuti
export const maxDuration = 300;
import { CityForm, UserForm } from "./forms";

export default async function SettingsPage() {
  const me = await requireAdmin();
  const [cities, users, sync, backfill] = await Promise.all([
    listCities(),
    db.select().from(schema.appUsers).orderBy(asc(schema.appUsers.name)),
    lastSync(),
    getBackfillState(),
  ]);
  const counts = sync?.counts as { vehicles?: number; vehiclesWithoutCity?: number; rides?: number; customers?: number } | null;
  return (
    <>
      <PageHeader title="Impostazioni" subtitle="Città, condizioni economiche degli affiliati e accessi del team." />

      <Card title="Sincronizzazione con Atom" className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
          <div className="text-ink-2">
            {sync ? (
              <>
                Ultima: {sync.startedAt.toLocaleString("it-IT", { timeZone: "Europe/Rome" })} ·{" "}
                {sync.ok ? <span className="text-brand">riuscita</span> : sync.ok === false ? <span className="text-critical">fallita: {sync.message}</span> : "in corso"}
                {counts && ` · ${counts.vehicles} veicoli (${counts.vehiclesWithoutCity} fuori dalle aree), ${counts.rides} corse, ${counts.customers} clienti`}
              </>
            ) : (
              "Nessuna sincronizzazione ancora eseguita. Parte ogni mattina alle 6."
            )}
          </div>
          <div className="flex gap-2">
            <a href="/impostazioni/diagnostica" className="btn-secondary">Diagnostica Atom</a>
            <form action={recompute}>
              <button className="btn-secondary">Ricalcola KPI e task</button>
            </form>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-3">
          Veicoli e corse vengono assegnati alla città più vicina il cui raggio li contiene. Dopo aver cambiato aree, % o fee usa “Ricalcola”.
        </p>
      </Card>

      <Card title="Import dello storico Atom" className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
          <div className="text-ink-2">
            {!backfill && "Non ancora avviato. Configura prima le città (centro e raggio), poi avvia l'import."}
            {backfill && !backfill.done && `In corso: ${backfill.rides.toLocaleString("it-IT")} corse importate. Premi “Continua” finché non risulta completato.`}
            {backfill?.done && `Completato: ${backfill.rides.toLocaleString("it-IT")} corse importate.`}
          </div>
          <form action={importHistory} className="flex gap-2">
            {backfill?.done ? (
              <button name="restart" value="1" className="btn-secondary">Reimporta tutto</button>
            ) : (
              <button className="btn-primary">{backfill ? "Continua import" : "Avvia import"}</button>
            )}
          </form>
        </div>
        <p className="mt-3 text-xs text-ink-3">Ogni blocco dura circa 4 minuti: la pagina resta in caricamento finché il blocco non finisce.</p>
      </Card>

      <Card title="Città e affiliati" className="mb-6">
        <div className="space-y-6">
          {cities.map((c) => (
            <div key={c.id} className="border-b border-line pb-6">
              <div className="mb-3 text-sm font-medium">{c.name}</div>
              <CityForm city={c} />
            </div>
          ))}
          <div>
            <div className="mb-3 text-sm font-medium text-brand">Nuova città</div>
            <CityForm />
          </div>
        </div>
      </Card>

      <Card title="Accessi">
        <table className="table mb-6">
          <thead>
            <tr><th>Nome</th><th>Email</th><th>Ruolo</th><th /></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="text-ink-2">{u.email}</td>
                <td>{u.role === "admin" ? "Amministratore" : "Operatore"}</td>
                <td className="text-right">
                  {u.id !== me.id && (
                    <form action={deleteUser}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="text-xs text-ink-3 hover:text-critical">Rimuovi</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <UserForm />
      </Card>
    </>
  );
}
