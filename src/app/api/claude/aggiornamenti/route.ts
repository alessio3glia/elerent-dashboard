import { isAuthorizedCron } from "@/lib/cron";
import { CLAUDE_STATUSES, pendingForClaude, setClaudeStatus, type ClaudeStatus } from "@/lib/dashboard-updates";

/**
 * Coda degli aggiornamenti scritti dai dipendenti per Claude, letta dalla sua routine automatica.
 * GET: richieste e note non ancora chiuse. POST {id, status, reply}: stato e risposta mostrati nella pagina.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new Response("Non autorizzato", { status: 401 });
  return Response.json({ pending: await pendingForClaude() });
}

export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return new Response("Non autorizzato", { status: 401 });
  const body = (await request.json().catch(() => null)) as { id?: unknown; status?: unknown; reply?: unknown } | null;
  const id = Number(body?.id);
  const status = body?.status;
  if (!id || !CLAUDE_STATUSES.includes(status as ClaudeStatus)) {
    return Response.json({ error: `Serve id e status tra ${CLAUDE_STATUSES.join(", ")}` }, { status: 400 });
  }
  const reply = typeof body?.reply === "string" ? body.reply.trim().slice(0, 4000) || null : null;
  const ok = await setClaudeStatus(id, status as ClaudeStatus, reply);
  return ok ? Response.json({ ok }) : Response.json({ error: "Aggiornamento non trovato" }, { status: 404 });
}
