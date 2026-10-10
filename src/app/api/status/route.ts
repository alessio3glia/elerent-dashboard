import { sql } from "drizzle-orm";
import { after } from "next/server";
import { BACKFILL_LOCK, resumeBackfillIfStalled } from "@/lib/backfill-chain";
import { db } from "@/lib/db";
import { getBackfillStatus, isLocked } from "@/lib/sync/sync";
import { getLiveState } from "@/lib/live";
import { getSubscriptionsState } from "@/lib/sync/subscriptions";

/** Regione del database ricavata dal nome dell'host (es. eu-central-1), senza esporre l'indirizzo. */
function dbRegion() {
  try {
    return /\.([a-z]{2}-[a-z]+-\d)\./.exec(new URL(process.env.DATABASE_URL ?? "").hostname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

/**
 * Avanzamento dell'import e conteggi, senza dati personali: serve a controllare lo stato
 * dall'esterno senza fare login.
 */
export async function GET(request: Request) {
  // Leggere lo stato fa anche ripartire un import fermo, come aprire la dashboard.
  const origin = new URL(request.url).origin;
  after(() => resumeBackfillIfStalled(origin).catch((error) => console.error("Ripresa import non riuscita", error)));
  const started = Date.now();
  const [live, subscriptions, status, running, [counts]] = await Promise.all([
    getLiveState(),
    getSubscriptionsState(),
    getBackfillStatus(),
    isLocked(BACKFILL_LOCK),
    db.execute<{ rides: number; first_ride: string | null; last_ride: string | null; customers: number; vehicles: number; cities: number; metric_days: number; subscriptions: number; vehicles_signal_24h: number }>(sql`
      select (select count(*) from rides)::int as rides,
             (select min(start_time)::date::text from rides) as first_ride,
             (select max(start_time)::date::text from rides) as last_ride,
             (select count(*) from customers)::int as customers,
             (select count(*) from subscriptions)::int as subscriptions,
             (select count(*) from vehicles where last_signal_at >= now() - interval '24 hours')::int as vehicles_signal_24h,
             (select count(*) from vehicles)::int as vehicles,
             (select count(*) from cities where active)::int as cities,
             (select count(distinct day) from daily_metrics)::int as metric_days`),
  ]);
  const s = status?.state;
  return Response.json({
    import: s
      ? {
          running,
          done: s.done,
          phase: s.phase,
          windowEnd: s.windowEnd ?? null,
          rangeShape: s.rangeShape ?? null,
          usersField: s.usersField ?? null,
          lastError: s.lastError ?? null,
          errors: s.errors ?? 0,
          updatedAt: status.updatedAt,
        }
      : null,
    live,
    subscriptions,
    database: counts,
    // Velocità: se la funzione e il database sono in regioni diverse, ogni query attraversa l'oceano.
    speed: { queryMs: Date.now() - started, functionRegion: process.env.VERCEL_REGION ?? null, databaseRegion: dbRegion() },
  });
}
