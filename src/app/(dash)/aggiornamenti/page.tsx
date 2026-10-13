import { revokeUpdate } from "@/app/actions/dashboard-updates";
import { Card, Empty, PageHeader } from "@/components/ui";
import { listDashboardUpdates } from "@/lib/dashboard-updates";
import { UPDATE_KINDS, cityOverrides, isUpdateKind, noteIsCurrent } from "@/lib/dashboard-updates-rules";
import { addDays, formatDay, localDay } from "@/lib/dates";
import { listCities } from "@/lib/queries";
import { UpdateForm } from "./form";

export const dynamic = "force-dynamic";

const CLAUDE: Record<string, { label: string; cls: string }> = {
  in_lavorazione: { label: "ci sta lavorando", cls: "text-info" },
  fatto: { label: "fatto", cls: "text-brand" },
  serve_chiarimento: { label: "serve un chiarimento", cls: "text-warning" },
};

const when = (d: Date) =>
  new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function UpdatesPage() {
  const today = localDay();
  const [rows, cities] = await Promise.all([listDashboardUpdates(), listCities({ all: true })]);
  const overrides = cityOverrides(rows.map((r) => r.update), today);

  // Stato di ogni aggiornamento oggi: quello che lo spiega al dipendente in una parola.
  const status = (u: (typeof rows)[number]["update"]) => {
    if (u.revokedAt) return { label: `annullato da ${u.revokedBy ?? "?"}`, cls: "text-ink-3" };
    if (u.startsOn > today) return { label: `dal ${formatDay(u.startsOn)}`, cls: "text-info" };
    if (u.kind === "richiesta") return { label: "per Claude", cls: "text-info" };
    if (u.kind === "nota") return noteIsCurrent(u, today, addDays(today, -7)) ? { label: "in home", cls: "text-brand" } : { label: "archiviata", cls: "text-ink-3" };
    if (u.kind === "citta_sospesa" && u.endsOn && u.endsOn < today) return { label: "finita", cls: "text-ink-3" };
    const latest = rows.find((r) => r.update.cityId === u.cityId && r.update.kind !== "nota" && !r.update.revokedAt && r.update.startsOn <= today);
    return latest?.update.id === u.id && overrides.has(u.cityId ?? -1) ? { label: "in vigore", cls: "text-brand" } : { label: "superato", cls: "text-ink-3" };
  };

  return (
    <>
      <PageHeader
        title="Aggiornamenti dashboard"
        subtitle="Dite alla dashboard quello che i dati Atom non sanno (città chiuse o sospese, eventi, fermi) e chiedete a Claude le modifiche: le legge da solo ogni ora e risponde nella colonna Claude."
      />
      <Card title="Nuovo aggiornamento">
        <UpdateForm cities={cities.map((c) => ({ id: c.id, name: c.name, active: c.active }))} today={today} />
      </Card>
      <Card title="Storico" className="mt-6">
        {rows.length === 0 ? (
          <Empty>Nessun aggiornamento ancora.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Scritto</th><th>Tipo</th><th>Città</th><th>Periodo</th><th>Testo</th><th>Stato</th><th>Claude</th><th /></tr>
              </thead>
              <tbody>
                {rows.map(({ update: u, cityName }) => {
                  const s = status(u);
                  return (
                    <tr key={u.id} className={u.revokedAt ? "opacity-60" : ""}>
                      <td className="whitespace-nowrap text-ink-2">{when(u.createdAt)}<div className="text-xs text-ink-3">{u.userName}</div></td>
                      <td className="whitespace-nowrap">{isUpdateKind(u.kind) ? UPDATE_KINDS[u.kind].label : u.kind}</td>
                      <td>{cityName ?? "Tutta la rete"}</td>
                      <td className="whitespace-nowrap text-ink-2">{formatDay(u.startsOn)}{u.endsOn ? ` → ${formatDay(u.endsOn)}` : ""}</td>
                      <td className="max-w-md">{u.text}</td>
                      <td className={`whitespace-nowrap text-xs ${s.cls}`}>{s.label}</td>
                      <td className="max-w-sm text-xs">
                        {!u.revokedAt && (
                          <>
                            <span className={CLAUDE[u.claudeStatus ?? ""]?.cls ?? "text-warning"}>{CLAUDE[u.claudeStatus ?? ""]?.label ?? "da leggere"}</span>
                            {u.claudeReply && <span className="mt-0.5 block whitespace-pre-line text-ink-2">{u.claudeReply}</span>}
                          </>
                        )}
                      </td>
                      <td>
                        {!u.revokedAt && (
                          <form action={revokeUpdate}>
                            <input type="hidden" name="id" value={u.id} />
                            <button className="text-xs text-ink-3 hover:text-critical">Annulla</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
