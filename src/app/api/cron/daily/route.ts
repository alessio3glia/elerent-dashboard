import { isAuthorizedCron } from "@/lib/cron";
import { runDaily } from "@/lib/pipeline";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new Response("Non autorizzato", { status: 401 });
  try {
    return Response.json(await runDaily());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
