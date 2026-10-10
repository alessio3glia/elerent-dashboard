import { isAuthorizedCron } from "@/lib/cron";
import { liveSync } from "@/lib/live";

export const maxDuration = 300;

/** Corse nuove da Atom ogni pochi minuti (chiamato da GitHub Actions o da qualsiasi pianificatore esterno). */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new Response("Non autorizzato", { status: 401 });
  return Response.json(await liveSync(true));
}
