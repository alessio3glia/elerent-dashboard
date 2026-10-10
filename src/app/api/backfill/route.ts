import { waitUntil } from "@vercel/functions";
import { BACKFILL_LOCK, MAX_CONSECUTIVE_ERRORS, chainSecret, triggerBackfillStep } from "@/lib/backfill-chain";
import { runBackfill } from "@/lib/pipeline";
import { acquireLock, recordBackfillError, releaseLock } from "@/lib/sync/sync";

export const maxDuration = 300;

// Lascia margine sotto i 300 secondi per i tentativi ripetuti verso Atom e per avviare il blocco successivo.
const BUDGET_MS = Number(process.env.BACKFILL_BUDGET_MS) || 180_000;

/**
 * Esegue un blocco dell'import storico in background e, se non è finito, richiama sé stesso.
 * Così l'import prosegue da solo sul server anche con la pagina chiusa. Dopo un errore riprova
 * fino a MAX_CONSECUTIVE_ERRORS volte di fila prima di fermarsi.
 */
export async function POST(request: Request) {
  const secret = chainSecret();
  if (!secret || request.headers.get("x-backfill-secret") !== secret) return new Response("Non autorizzato", { status: 401 });
  if (!(await acquireLock(BACKFILL_LOCK, BUDGET_MS + 100_000))) return Response.json({ status: "già in corso" }, { status: 202 });

  const url = new URL(request.url);
  const restart = url.searchParams.get("restart") === "1";
  waitUntil(
    (async () => {
      let next = false;
      try {
        const result = await runBackfill(BUDGET_MS, restart);
        next = !result.state.done;
        console.log(`Import storico: blocco terminato, finito=${result.state.done}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Import storico: blocco fallito", error);
        const errors = await recordBackfillError(message).catch(() => MAX_CONSECUTIVE_ERRORS);
        next = errors < MAX_CONSECUTIVE_ERRORS;
        if (next) await new Promise((resolve) => setTimeout(resolve, 20_000));
      } finally {
        await releaseLock(BACKFILL_LOCK);
      }
      if (next) await triggerBackfillStep(url.origin);
    })(),
  );
  return Response.json({ status: "avviato" }, { status: 202 });
}
