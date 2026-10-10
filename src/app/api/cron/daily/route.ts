import { isAuthorizedCron } from "@/lib/cron";
import { BACKFILL_LOCK, triggerBackfillStep } from "@/lib/backfill-chain";
import { runDaily } from "@/lib/pipeline";
import { getBackfillState, isLocked } from "@/lib/sync/sync";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new Response("Non autorizzato", { status: 401 });
  try {
    // Se l'import dello storico è stato avviato ma non finito, il cron lo porta avanti (anche dopo troppi errori di fila)
    const backfill = await getBackfillState();
    if (backfill && !backfill.done) {
      if (!(await isLocked(BACKFILL_LOCK))) await triggerBackfillStep(new URL(request.url).origin);
      return Response.json({ status: "import storico in corso" });
    }
    return Response.json(await runDaily());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
