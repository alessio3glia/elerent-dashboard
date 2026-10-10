"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { importHistoryStep } from "@/app/actions/settings";

type Props = { initial: { rides: number; done: boolean } | null };

/** Avvia l'import dello storico e lo porta avanti da solo, blocco dopo blocco, finché la pagina resta aperta. */
export function BackfillRunner({ initial }: Props) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(restart: boolean) {
    setRunning(true);
    setError(null);
    try {
      let first = true;
      for (;;) {
        const next = await importHistoryStep(restart && first);
        first = false;
        setState(next);
        if (next.done) break;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore durante l'import");
    } finally {
      setRunning(false);
    }
  }

  const rides = state?.rides.toLocaleString("it-IT", { useGrouping: "always" }) ?? "0";
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
      <div className="text-ink-2">
        {running && (
          <span className="text-brand">Import in corso: {rides} corse importate. Tieni aperta questa pagina.</span>
        )}
        {!running && !state && "Non ancora avviato. Le città vengono create da sole in base a dove sono i veicoli."}
        {!running && state && !state.done && `Interrotto a ${rides} corse: premi “Continua” per riprendere.`}
        {!running && state?.done && `Completato: ${rides} corse importate.`}
        {error && <div className="mt-1 text-critical">{error}</div>}
      </div>
      {!running &&
        (state?.done ? (
          <button onClick={() => run(true)} className="btn-secondary">Reimporta tutto</button>
        ) : (
          <button onClick={() => run(false)} className="btn-primary">{state ? "Continua import" : "Importa tutto lo storico"}</button>
        ))}
    </div>
  );
}
