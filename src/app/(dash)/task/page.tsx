import { TaskCard } from "@/components/task-card";
import { Empty, PageHeader } from "@/components/ui";
import { localDay } from "@/lib/dates";
import { tasksForDay } from "@/lib/queries";

export default async function TasksPage() {
  const today = localDay();
  const rows = await tasksForDay(today);
  const open = rows.filter((r) => r.task.status === "aperta");
  const done = rows.filter((r) => r.task.status !== "aperta");
  return (
    <>
      <PageHeader
        title="Task di oggi"
        subtitle={`${open.length} da fare · ${done.length} completate. Generate ogni mattina dai dati di ieri; le task aperte restano in lista per 7 giorni.`}
      />
      <div className="space-y-3">
        {open.map(({ task, city }) => <TaskCard key={task.id} task={task} city={city} today={today} />)}
        {open.length === 0 && <Empty>Nessuna task aperta.</Empty>}
      </div>
      {done.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-sm font-medium text-ink-2">Completate</h2>
          <div className="space-y-3">
            {done.map(({ task, city }) => <TaskCard key={task.id} task={task} city={city} today={today} />)}
          </div>
        </>
      )}
    </>
  );
}
