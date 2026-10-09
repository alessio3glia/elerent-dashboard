import { asc } from "drizzle-orm";
import { deleteUser, recompute } from "@/app/actions/settings";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { lastSync, listCities } from "@/lib/queries";
import { CityForm, UserForm } from "./forms";

export default async function SettingsPage() {
  const me = await requireAdmin();
  const [cities, users, sync] = await Promise.all([
    listCities(),
    db.select().from(schema.appUsers).orderBy(asc(schema.appUsers.name)),
    lastSync(),
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
          <form action={recompute}>
            <button className="btn-secondary">Ricalcola KPI e task</button>
          </form>
        </div>
        <p className="mt-3 text-xs text-ink-3">
          Veicoli e corse vengono assegnati alla città più vicina il cui raggio li contiene. Dopo aver cambiato aree, % o fee usa “Ricalcola”.
        </p>
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
