import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, children, className = "", action }: { title?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-medium text-ink-2">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Variazione colorata: verde se buona, rosso se cattiva, con segno sempre visibile. */
export function Delta({ value, higherIsBetter = true }: { value: number | null; higherIsBetter?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-ink-3">—</span>;
  const good = value === 0 ? null : (value > 0) === higherIsBetter;
  const color = good === null ? "text-ink-2" : good ? "text-brand" : "text-critical";
  return (
    <span className={`tabular text-sm font-medium ${color}`}>
      {value > 0 ? "▲" : value < 0 ? "▼" : "■"} {value > 0 ? "+" : ""}
      {Math.round(value * 100)}%
    </span>
  );
}

export function StatTile({ label, value, delta, higherIsBetter, hint }: { label: string; value: string; delta?: number | null; higherIsBetter?: boolean; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="text-sm text-ink-2">{label}</div>
      <div className="tabular mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-2 flex items-center gap-2 text-xs text-ink-3">
        {delta !== undefined && <Delta value={delta} higherIsBetter={higherIsBetter} />}
        {hint && <span>{hint}</span>}
      </div>
    </div>
  );
}

const SEVERITY = {
  critical: { label: "Critico", icon: "●", cls: "bg-critical/15 text-critical" },
  warning: { label: "Attenzione", icon: "▲", cls: "bg-warning/15 text-warning" },
  info: { label: "Info", icon: "◆", cls: "bg-info/15 text-info" },
} as const;

export function SeverityBadge({ severity }: { severity: string }) {
  const s = SEVERITY[severity as keyof typeof SEVERITY] ?? SEVERITY.info;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}

const PRIORITY = {
  1: { label: "Alta", cls: "bg-critical/15 text-critical" },
  2: { label: "Media", cls: "bg-warning/15 text-warning" },
  3: { label: "Bassa", cls: "bg-surface-2 text-ink-2" },
} as const;

export function PriorityBadge({ priority }: { priority: number }) {
  const p = PRIORITY[priority as 1 | 2 | 3] ?? PRIORITY[3];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.cls}`}>Priorità {p.label.toLowerCase()}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-3">{children}</p>;
}
