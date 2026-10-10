import type { getBackfillState } from "@/lib/sync/sync";

type State = Awaited<ReturnType<typeof getBackfillState>>;

const fmtDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

/** Frase che dice a che punto è l'import, per la pagina Impostazioni. */
export function backfillStepLabel(state: State): string | null {
  if (!state || state.done) return null;
  if (state.phase === "rides") return "Fase 1 di 3: corse recenti.";
  if (state.phase === "history" || (state.phase === "customers" && state.rangeShape === undefined)) {
    return state.windowEnd ? `Fase 2 di 3: storico corse, arrivato a ${fmtDay(state.windowEnd)}.` : "Fase 2 di 3: storico corse.";
  }
  const slow = state.lastPageMs && state.lastPageMs > 5_000 ? ` Atom risponde lento (${Math.round(state.lastPageMs / 1000)} s per 100 utenti).` : "";
  return `Fase 3 di 3: utenti.${slow}`;
}
