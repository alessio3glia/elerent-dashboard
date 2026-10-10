import Link from "next/link";
import { completeTask } from "@/app/actions/tasks";
import { PriorityBadge } from "@/components/ui";
import type { City, Task } from "@/lib/db/schema";
import { formatDay } from "@/lib/dates";

const KIND = { chiamata: "Chiamata", verifica: "Verifica", ottimizzazione: "Ottimizzazione" } as Record<string, string>;

export function TaskCard({ task, city, today }: { task: Task; city: City; today: string }) {
  const done = task.status !== "aperta";
  return (
    <article className={`rounded-xl border bg-surface p-5 ${done ? "border-line opacity-60" : "border-line"}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <PriorityBadge priority={task.priority} />
        <span className="rounded-full bg-surface-2 px-2 py-0.5">{KIND[task.kind] ?? task.kind}</span>
        <Link href={`/citta/${city.slug}`} className="hover:text-brand">{city.name}</Link>
        {task.day !== today && <span className="text-warning">dal {formatDay(task.day)}</span>}
      </div>
      <div className="mt-2 flex items-start gap-3">
        {/* Casella: spunta veloce (fatta) o, se già spuntata, la riapre. Ogni spunta finisce in Attività svolte. */}
        <form action={completeTask}>
          <input type="hidden" name="id" value={task.id} />
          <button
            name="status"
            value={done ? "aperta" : "fatta"}
            title={done ? "Riapri" : "Segna come fatta"}
            className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border text-xs font-bold ${
              task.status === "fatta" ? "border-brand bg-brand text-black" : "border-ink-3 hover:border-brand"
            }`}
          >
            {task.status === "fatta" ? "✓" : task.status === "saltata" ? "–" : ""}
          </button>
        </form>
        <h3 className={`text-base font-medium ${done ? "line-through" : ""}`}>{task.title}</h3>
      </div>
      <p className="mt-1 text-sm text-ink-2">{task.reason}</p>
      <p className="mt-2 text-sm">
        <span className="text-brand">Cosa fare:</span> {task.action}
      </p>
      {task.kind === "chiamata" && city.contactPhone && !done && (
        <a href={`tel:${city.contactPhone.replace(/\s/g, "")}`} className="mt-2 inline-block text-sm text-brand hover:underline">
          Chiama {city.contactName ?? city.affiliateName ?? ""} · {city.contactPhone}
        </a>
      )}
      {done ? (
        <div className="mt-3 text-sm text-ink-2">
          {task.status === "fatta" ? "Fatta" : "Saltata"} da {task.completedBy}
          {task.note && <> · “{task.note}”</>}
          <form action={completeTask} className="inline">
            <input type="hidden" name="id" value={task.id} />
            <button name="status" value="aperta" className="ml-3 text-xs text-ink-3 hover:text-brand">Riapri</button>
          </form>
        </div>
      ) : (
        <form action={completeTask} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="id" value={task.id} />
          <input name="note" placeholder="Esito / nota (es. 'Sentito Marco, 6 veicoli in officina fino a lunedì')" className="input flex-1" />
          <div className="flex gap-2">
            <button name="status" value="fatta" className="btn-primary">Fatta</button>
            <button name="status" value="saltata" className="btn-secondary">Salta</button>
          </div>
        </form>
      )}
    </article>
  );
}
