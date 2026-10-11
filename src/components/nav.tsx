"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

const LINKS = [
  { href: "/", label: "Panoramica" },
  { href: "/task", label: "Task di oggi" },
  { href: "/task/storico", label: "Task non svolte" },
  { href: "/attivita", label: "Attività svolte" },
  { href: "/alert", label: "Alert" },
  { href: "/ricavi", label: "Ricavi" },
  { href: "/recupero", label: "Recupero crediti" },
  { href: "/analytics", label: "Analytics" },
  { href: "/citta", label: "Città" },
  { href: "/heatmap", label: "Heatmap" },
  { href: "/utenti", label: "Utenti" },
  { href: "/abbonamenti", label: "Abbonamenti" },
  { href: "/notifiche", label: "Notifiche" },
  { href: "/aggiornamenti", label: "Aggiornamenti dashboard" },
];

/** Puntino che pulsa sul link cliccato finché la pagina non arriva. */
function Pending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`ml-2 h-1.5 w-1.5 rounded-full bg-brand transition-opacity ${pending ? "animate-pulse opacity-100" : "opacity-0"}`} />;
}

/**
 * Link del menu che scarica la pagina intera (dati compresi) appena il mouse ci passa sopra o il dito la tocca:
 * al clic la pagina è già pronta e si apre senza schermata di caricamento.
 */
function NavLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const [intent, setIntent] = useState(false);
  const warm = () => setIntent(true);
  return (
    <Link href={href} prefetch={intent ? true : null} onMouseEnter={warm} onTouchStart={warm} onFocus={warm} className={className}>
      {children}
    </Link>
  );
}

export function Nav({ isAdmin, openTasks }: { isAdmin: boolean; openTasks: number }) {
  const path = usePathname();
  const links = isAdmin ? [...LINKS, { href: "/impostazioni", label: "Impostazioni" }] : LINKS;
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {links.map((l) => {
        // Il link più specifico vince: /task/storico accende "Task non svolte", non "Task di oggi".
        const matches = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
        const active = matches(l.href) && !links.some((o) => o.href.length > l.href.length && o.href.startsWith(l.href) && matches(o.href));
        return (
          <NavLink
            key={l.href}
            href={l.href}
            className={`flex items-center justify-between whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
              active ? "bg-brand-soft font-medium text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <span className="flex items-center">
              {l.label}
              <Pending />
            </span>
            {l.href === "/task" && openTasks > 0 && (
              <span className="ml-2 rounded-full bg-brand px-2 text-xs font-semibold text-black">{openTasks}</span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
