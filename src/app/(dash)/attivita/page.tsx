import Link from "next/link";
import { addActivity, removeActivity } from "@/app/actions/activities";
import { Card, Empty, PageHeader } from "@/components/ui";
import { activitiesOfDay, notificationsOfDay, recentDays } from "@/lib/activities";
import { requireUser } from "@/lib/auth/session";
import { addDays, formatDay, localDay } from "@/lib/dates";
import { listCities } from "@/lib/queries";

export const dynamic = "force-dynamic";

const KIND: Record<string, { label: string; mark: string; cls: string }> = {
  task_fatta: { label: "Task fatta", mark: "✓", cls: "bg-brand text-black" },
  attivita: { label: "Attività", mark: "✓", cls: "bg-brand text-black" },
  notifica: { label: "Notifica inviata", mark: "✓", cls: "bg-brand text-black" },
  task_saltata: { label: "Task saltata", mark: "–", cls: "bg-surface-2 text-ink-3" },
};

const time = (d: Date) => new Date(d).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });

export default async function ActivityPage({ searchParams }: PageProps<"/attivita">) {
  const sp = await searchParams;
  const today = localDay();
  const day = typeof sp.giorno === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.giorno) ? sp.giorno : today;
  const who = typeof sp.chi === "string" ? sp.chi : "";
  const [user, rows, sent, days, cities] = await Promise.all([
    requireUser(),
    activitiesOfDay(day),
    notificationsOfDay(day).catch(() => []),
    recentDays(addDays(today, -30)),
    listCities(),
  ]);

  // Registro unico del giorno: task, attività a mano e notifiche inviate (non le prove).
  const entries = [
    ...rows.map(({ activity: a, cityName }) => ({ key: `a${a.id}`, id: a.id, kind: a.kind, at: a.at, who: a.userName, userId: a.userId, title: a.title, note: a.note, city: cityName })),
    ...sent
      .filter((n) => !n.test && n.status !== "errore")
      .map((n) => ({ key: `n${n.id}`, id: n.id, kind: "notifica", at: n.created_at, who: n.sent_by, userId: null, title: `Notifica “${n.title}” a ${n.recipients} utenti`, note: null, city: null })),
  ]
    .filter((e) => !who || e.who === who)
    .sort((a, b) => +new Date(a.at) - +new Date(b.at));

  const people = [...new Set([...rows.map((r) => r.activity.userName), ...sent.map((n) => n.sent_by)])].sort();
  const summary = people.map((name) => {
    const mine = entries.filter((e) => e.who === name);
    const all = [...rows.filter((r) => r.activity.userName === name).map((r) => r.activity.at), ...sent.filter((n) => n.sent_by === name).map((n) => n.created_at)];
    const times = all.map((d) => +new Date(d)).sort((a, b) => a - b);
    return {
      name,
      done: mine.filter((e) => e.kind === "task_fatta").length,
      manual: mine.filter((e) => e.kind === "attivita" || e.kind === "notifica").length,
      skipped: mine.filter((e) => e.kind === "task_saltata").length,
      from: times[0],
      to: times.at(-1),
    };
  });

  const href = (patch: Record<string, string>) => `/attivita?${new URLSearchParams({ giorno: day, ...(who ? { chi: who } : {}), ...patch })}`;

  return (
    <>
      <PageHeader title="Attività svolte" subtitle={`Tutto quello che è stato fatto ${day === today ? "oggi" : `il ${formatDay(day)}`}: task spuntate, attività aggiunte e notifiche inviate.`}>
        <div className="flex items-center gap-2 text-sm">
          <Link href={href({ giorno: addDays(day, -1) })} className="btn-secondary">← Giorno prima</Link>
          {day !== today && <Link href={href({ giorno: addDays(day, 1) })} className="btn-secondary">Giorno dopo →</Link>}
        </div>
      </PageHeader>

      {day === today && (
        <Card title="Aggiungi un'attività fatta" className="mb-6">
          <form action={addActivity} className="flex flex-col gap-2 md:flex-row">
            <input name="title" required maxLength={300} placeholder="Cosa hai fatto (es. Ricaricati 12 veicoli in zona stazione)" className="input flex-1" />
            <select name="cityId" className="input md:w-48" defaultValue="">
              <option value="">Nessuna città</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input name="note" maxLength={1000} placeholder="Nota (facoltativa)" className="input md:w-64" />
            <button className="btn-primary">✓ Fatto</button>
          </form>
        </Card>
      )}

      {summary.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {summary.map((s) => (
            <Link key={s.name} href={href({ chi: who === s.name ? "" : s.name })} className={`rounded-xl border bg-surface p-5 ${who === s.name ? "border-brand" : "border-line hover:border-ink-3"}`}>
              <div className="font-medium">{s.name}</div>
              <div className="tabular mt-2 text-3xl font-semibold text-brand">{s.done + s.manual}</div>
              <div className="mt-1 text-xs text-ink-3">
                {s.done} task fatte · {s.manual} attività e notifiche{s.skipped ? ` · ${s.skipped} saltate` : ""}
                {s.from && s.to && <> · dalle {time(new Date(s.from))} alle {time(new Date(s.to))}</>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Card title={`Registro${who ? ` · ${who}` : ""} · ${entries.length} voci`}>
        {entries.length === 0 ? (
          <Empty>Nessuna attività registrata in questo giorno.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {entries.map((e) => {
              const k = KIND[e.kind] ?? KIND.attivita;
              return (
                <li key={e.key} className="flex items-start gap-3 py-3">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold ${k.cls}`} aria-label={k.label}>{k.mark}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{e.title}</div>
                    <div className="mt-0.5 text-xs text-ink-3">
                      {time(new Date(e.at))} · {e.who} · {k.label}{e.city ? ` · ${e.city}` : ""}
                    </div>
                    {e.note && <div className="mt-1 text-sm text-ink-2">“{e.note}”</div>}
                  </div>
                  {e.kind === "attivita" && e.userId === user.id && day === today && (
                    <form action={removeActivity}>
                      <input type="hidden" name="id" value={e.id} />
                      <button className="text-xs text-ink-3 hover:text-critical">Togli</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {days.length > 0 && (
        <Card title="Ultimi 30 giorni" className="mt-6 overflow-x-auto">
          <table className="table tabular">
            <thead>
              <tr><th>Giorno</th><th>Dipendente</th><th className="text-right">Fatte</th><th className="text-right">Saltate</th></tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={`${d.day}-${d.userName}`}>
                  <td><Link href={`/attivita?${new URLSearchParams({ giorno: d.day, chi: d.userName })}`} className="hover:text-brand">{formatDay(d.day)}</Link></td>
                  <td>{d.userName}</td>
                  <td className="text-right text-brand">{d.done}</td>
                  <td className="text-right text-ink-3">{d.skipped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
