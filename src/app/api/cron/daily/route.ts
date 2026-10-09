import { isAuthorizedCron } from "@/lib/cron";
import { runBackfill, runDaily } from "@/lib/pipeline";
import { getBackfillState } from "@/lib/sync/sync";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new Response("Non autorizzato", { status: 401 });
  try {
    // Se l'import dello storico è stato avviato ma non finito, il cron lo porta avanti
    const backfill = await getBackfillState();
    if (backfill && !backfill.done) return Response.json(await runBackfill(250_000));
    return Response.json(await runDaily());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
