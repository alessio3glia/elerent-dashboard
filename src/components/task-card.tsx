import Link from "next/link";
import { completeTask } from "@/app/actions/tasks";
import { PriorityBadge } from "@/components/ui";
import type { City, Task } from "@/lib/db/schema";
import { formatDay } from "@/lib/dates";

const KIND = { chiamata: "Chiamata", verifica: "Verifica", ottimizzazione: "Ottimizzazione", notifica: "Notifiche e marketing" } as Record<string, string>;

/** Dove si fa la task di rete: la pagina Notifiche sul segmento giusto, o Recupero crediti. */
function taskLink(rule: string): { href: string; label: string } | null {
  if (rule.startsWith("recupero:")) return { href: "/recupero", label: "Apri Recupero crediti" };
  if (rule.startsWith("notifica:")) return { href: `/notifiche?segmento=${rule.split(":")[1]}`, label: "Apri Notifiche" };
  return null;
}

/** `readOnly`: task di un giorno passato, solo da consultare (com'era a fine giornata). */
export function TaskCard({ task, city, today, readOnly = false }: { task: Task; city: City | null; today: string; readOnly?: boolean }) {
  const done = task.status !== "aperta";
  const link = taskLink(task.rule);
  return (
    <article className={`rounded-xl border bg-surface p-5 ${done ? "border-line opacity-60" : "border-line"}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <PriorityBadge priority={task.priority} />
        <span className="rounded-full bg-surface-2 px-2 py-0.5">{KIND[task.kind] ?? task.kind}</span>
        {city ? <Link href={`/citta/${city.slug}`} className="hover:text-brand">{city.name}</Link> : <span>Tutta la rete</span>}
        {task.day !== today && <span className="text-ink-3">{formatDay(task.day)}</span>}
      </div>
      <div className="mt-2 flex items-start gap-3">
        {/* Casella: spunta veloce (fatta) o, se già spuntata, la riapre. Ogni spunta finisce in Attività svolte. */}
        {readOnly ? (
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${task.status === "fatta" ? "border-brand bg-brand text-black" : "border-critical text-critical"}`}>
            {task.status === "fatta" ? "✓" : task.status === "saltata" ? "–" : "✕"}
          </span>
        ) : (
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
        )}
        <h3 className={`text-base font-medium ${done ? "line-through" : ""}`}>{task.title}</h3>
      </div>
      <p className="mt-1 text-sm text-ink-2">{task.reason}</p>
      <p className="mt-2 text-sm">
        <span className="text-brand">Cosa fare:</span> {task.action}
      </p>
      {link && !done && !readOnly && (
        <Link href={link.href} className="btn-secondary mt-3 inline-flex">{link.label} →</Link>
      )}
      {task.kind === "chiamata" && city?.contactPhone && !done && !readOnly && (
        <a href={`tel:${city?.contactPhone?.replace(/\s/g, "")}`} className="mt-2 inline-block text-sm text-brand hover:underline">
          Chiama {city?.contactName ?? city?.affiliateName ?? ""} · {city.contactPhone}
        </a>
      )}
      {readOnly ? (
        <div className="mt-3 text-sm text-ink-2">
          {task.status === "fatta" ? `Fatta da ${task.completedBy}` : task.status === "saltata" ? `Saltata da ${task.completedBy}` : <span className="text-critical">Non svolta</span>}
          {task.note && <> · “{task.note}”</>}
        </div>
      ) : done ? (
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
