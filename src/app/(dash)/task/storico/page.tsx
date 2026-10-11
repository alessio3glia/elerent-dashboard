import Link from "next/link";
import { TaskCard } from "@/components/task-card";
import { Card, Empty, PageHeader } from "@/components/ui";
import { addDays, formatDay, localDay } from "@/lib/dates";
import { taskDays, tasksForDay } from "@/lib/queries";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

/** Storico delle task per giorno: quelle non svolte (rimaste aperte o saltate) e quelle svolte. */
export default async function TaskHistoryPage({ searchParams }: PageProps<"/task/storico">) {
  const sp = await searchParams;
  const today = localDay();
  const svolte = sp.stato === "svolte";
  const day = typeof sp.giorno === "string" && DAY.test(sp.giorno) && sp.giorno <= today ? sp.giorno : svolte ? today : addDays(today, -1);
  const [rows, days] = await Promise.all([tasksForDay(day), taskDays(addDays(today, -30), today)]);
  const shown = rows.filter((r) => (svolte ? r.task.status === "fatta" : r.task.status !== "fatta"));
  const ongoing = day === today && !svolte;

  const href = (patch: Record<string, string>) => `/task/storico?${new URLSearchParams({ stato: svolte ? "svolte" : "non-svolte", giorno: day, ...patch })}`;
  const tab = (active: boolean) => `rounded-lg px-3 py-1.5 text-sm ${active ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink"}`;

  return (
    <>
      <PageHeader title={svolte ? "Task svolte" : "Task non svolte"} subtitle={`${longDay(day)} · ${shown.length} ${svolte ? "fatte" : "non fatte o saltate"} su ${rows.length}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href({ stato: "non-svolte" })} className={tab(!svolte)}>Non svolte</Link>
          <Link href={href({ stato: "svolte" })} className={tab(svolte)}>Svolte</Link>
          <span className="mx-1 h-5 w-px bg-line" />
          <Link href={href({ giorno: addDays(day, -1) })} className="btn-secondary">←</Link>
          <form action="/task/storico" className="flex gap-2">
            <input type="hidden" name="stato" value={svolte ? "svolte" : "non-svolte"} />
            <input type="date" name="giorno" defaultValue={day} max={today} className="input" aria-label="Giorno" />
            <button className="btn-secondary">Vai</button>
          </form>
          {day < today && <Link href={href({ giorno: addDays(day, 1) })} className="btn-secondary">→</Link>}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {ongoing && <p className="rounded-lg bg-surface-2 p-3 text-sm text-ink-2">La giornata di oggi è ancora in corso: queste task si possono ancora fare dalla pagina <Link href="/task" className="text-brand hover:underline">Task di oggi</Link>.</p>}
          {shown.map(({ task, city }) => <TaskCard key={task.id} task={task} city={city} today={today} readOnly />)}
          {shown.length === 0 && <Empty>{svolte ? "Nessuna task fatta in questo giorno." : rows.length ? "Tutte le task di questo giorno sono state fatte. 🎉" : "Nessuna task in questo giorno."}</Empty>}
        </div>

        <Card title="Ultimi 30 giorni" className="overflow-x-auto">
          <table className="table tabular">
            <thead>
              <tr><th>Giorno</th><th className="text-right">Task</th><th className="text-right">Fatte</th><th className="text-right">Non svolte</th></tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const missed = d.aperte + d.saltate;
                return (
                  <tr key={d.day} className={d.day === day ? "bg-surface-2" : undefined}>
                    <td><Link href={href({ giorno: d.day })} className="hover:text-brand">{formatDay(d.day)}</Link></td>
                    <td className="text-right">{d.total}</td>
                    <td className="text-right text-brand"><Link href={href({ giorno: d.day, stato: "svolte" })}>{d.fatte}</Link></td>
                    <td className={`text-right ${missed && d.day < today ? "font-medium text-critical" : "text-ink-3"}`}><Link href={href({ giorno: d.day, stato: "non-svolte" })}>{missed}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {days.length === 0 && <Empty>Nessuna task negli ultimi 30 giorni.</Empty>}
        </Card>
      </div>
    </>
  );
}
