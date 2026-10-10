"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { startHistoryImport } from "@/app/actions/settings";

type Props = { rides: number; done: boolean; running: boolean; started: boolean };

/** Avvia l'import storico, che prosegue sul server; la pagina si aggiorna da sola per mostrare l'avanzamento. */
export function BackfillRunner({ rides, done, running, started }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [justStarted, setJustStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = (running || justStarted) && !done;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(id);
  }, [active, router]);

  const start = (restart: boolean) =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await startHistoryImport(restart);
        if (result.error) return setError(`Avvio non riuscito: ${result.error}. Riprova tra poco.`);
        setJustStarted(true);
        router.refresh();
      } catch {
        setError("Avvio non riuscito. Ricarica la pagina e riprova.");
      }
    });

  const count = rides.toLocaleString("it-IT", { useGrouping: "always" });
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
      <div className="text-ink-2">
        {active && !done && <span className="text-brand">Import in corso sul server: {count} corse importate. Puoi chiudere la pagina.</span>}
        {!active && !started && "Non ancora avviato. Le città vengono create da sole in base a dove sono i veicoli."}
        {!active && started && !done && `Fermo a ${count} corse: premi “Continua” per riprendere.`}
        {done && `Completato: ${count} corse importate.`}
        {error && <div className="mt-1 text-red-400">{error}</div>}
      </div>
      {!active &&
        (done ? (
          <button disabled={pending} onClick={() => start(true)} className="btn-secondary">Reimporta tutto</button>
        ) : (
          <button disabled={pending} onClick={() => start(false)} className="btn-primary">
            {started ? "Continua import" : "Importa tutto lo storico"}
          </button>
        ))}
    </div>
  );
}
