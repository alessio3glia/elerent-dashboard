"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Panoramica" },
  { href: "/task", label: "Task di oggi" },
  { href: "/attivita", label: "Attività svolte" },
  { href: "/alert", label: "Alert" },
  { href: "/ricavi", label: "Ricavi" },
  { href: "/recupero", label: "Recupero crediti" },
  { href: "/analytics", label: "Analytics" },
  { href: "/citta", label: "Città" },
  { href: "/utenti", label: "Utenti" },
  { href: "/abbonamenti", label: "Abbonamenti" },
  { href: "/notifiche", label: "Notifiche" },
];

/** Puntino che pulsa sul link cliccato finché la pagina non arriva. */
function Pending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`ml-2 h-1.5 w-1.5 rounded-full bg-brand transition-opacity ${pending ? "animate-pulse opacity-100" : "opacity-0"}`} />;
}

export function Nav({ isAdmin, openTasks }: { isAdmin: boolean; openTasks: number }) {
  const path = usePathname();
  const links = isAdmin ? [...LINKS, { href: "/impostazioni", label: "Impostazioni" }] : LINKS;
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {links.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
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
          </Link>
        );
      })}
    </nav>
  );
}
