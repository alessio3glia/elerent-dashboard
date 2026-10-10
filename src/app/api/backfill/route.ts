import { waitUntil } from "@vercel/functions";
import { chainSecret, triggerBackfillStep } from "@/lib/backfill-chain";
import { runBackfill } from "@/lib/pipeline";
import { acquireLock, releaseLock } from "@/lib/sync/sync";

export const maxDuration = 300;

const LOCK = "backfill_lock";
const BUDGET_MS = Number(process.env.BACKFILL_BUDGET_MS) || 240_000;

/**
 * Esegue un blocco dell'import storico in background e, se non è finito, richiama sé stesso.
 * Così l'import prosegue da solo sul server anche con la pagina chiusa.
 */
export async function POST(request: Request) {
  const secret = chainSecret();
  if (!secret || request.headers.get("x-backfill-secret") !== secret) return new Response("Non autorizzato", { status: 401 });
  if (!(await acquireLock(LOCK, BUDGET_MS + 50_000))) return Response.json({ status: "già in corso" }, { status: 202 });

  const url = new URL(request.url);
  const restart = url.searchParams.get("restart") === "1";
  waitUntil(
    (async () => {
      let done = true;
      try {
        const result = await runBackfill(BUDGET_MS, restart);
        done = result.state.done;
      } catch (error) {
        console.error("Import storico fallito", error);
      } finally {
        await releaseLock(LOCK);
      }
      console.log(`Import storico: blocco terminato, finito=${done}`);
      if (!done) await triggerBackfillStep(url.origin);
    })(),
  );
  return Response.json({ status: "avviato" }, { status: 202 });
}
