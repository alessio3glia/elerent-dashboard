import { isAuthorizedCron } from "@/lib/cron";
import { addDays, localDay } from "@/lib/dates";
import { computeMetrics } from "@/lib/metrics/compute";
import { assignMissingCities } from "@/lib/pipeline";
import { reimportRides, ridesPerDay } from "@/lib/sync/repair";

export const maxDuration = 300;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Rilettura manuale delle corse di un periodo da Atom (sola lettura su Atom), per chiudere buchi nei dati.
 * GET /api/cron/reimport?from=YYYY-MM-DD&to=YYYY-MM-DD con "Authorization: Bearer $CRON_SECRET".
 * Lavora circa 4 minuti e risponde con `next` (giorno da cui richiamarla) se non ha finito.
 * Con &metrics=1 ricalcola invece i KPI del periodo (da fare una volta finita la rilettura).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new Response("Non autorizzato", { status: 401 });
  const params = new URL(request.url).searchParams;
  const today = localDay();
  const from = params.get("from") ?? addDays(today, -3);
  const to = params.get("to") ?? today;
  if (!DAY.test(from) || !DAY.test(to) || from > to) return Response.json({ error: "from/to non validi (YYYY-MM-DD)" }, { status: 400 });

  if (params.get("metrics") === "1") {
    await assignMissingCities();
    const yesterday = addDays(today, -1);
    await computeMetrics(from, to < yesterday ? to : yesterday);
    return Response.json({ metrics: { from, to } });
  }

  const before = await ridesPerDay(from, to);
  const result = await reimportRides(from, to, Date.now() + 230_000);
  const after = await ridesPerDay(from, to);
  const days = result.days.map((d) => ({ day: d.day, atom: d.atom, before: before[d.day] ?? 0, after: after[d.day] ?? 0 }));
  return Response.json({ days, next: result.next });
}
