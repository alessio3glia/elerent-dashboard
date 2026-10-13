import "server-only";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { addDays, localDay } from "@/lib/dates";
import { cityOverrides, noteIsCurrent, type UpdateKind } from "@/lib/dashboard-updates-rules";

const { dashboardUpdates, cities } = schema;

export async function addDashboardUpdate(entry: {
  user: { id: number | null; name: string };
  kind: UpdateKind;
  cityId: number | null;
  startsOn: string;
  endsOn: string | null;
  text: string;
}) {
  await db.insert(dashboardUpdates).values({
    userId: entry.user.id,
    userName: entry.user.name,
    kind: entry.kind,
    cityId: entry.cityId,
    startsOn: entry.startsOn,
    endsOn: entry.endsOn,
    text: entry.text,
    // Città chiuse, sospese o riaperte le applica subito la dashboard: Claude non deve fare altro.
    ...(entry.kind.startsWith("citta_") ? { claudeStatus: "fatto", claudeReply: "Applicato subito dalla dashboard.", claudeAt: new Date() } : {}),
  });
  await applyCityOverrides();
}

export const CLAUDE_STATUSES = ["in_lavorazione", "fatto", "serve_chiarimento"] as const;
export type ClaudeStatus = (typeof CLAUDE_STATUSES)[number];

/** Richieste e note che Claude non ha ancora chiuso, dalla più vecchia. */
export async function pendingForClaude() {
  return db
    .select({
      id: dashboardUpdates.id,
      createdAt: dashboardUpdates.createdAt,
      userName: dashboardUpdates.userName,
      kind: dashboardUpdates.kind,
      city: cities.name,
      startsOn: dashboardUpdates.startsOn,
      endsOn: dashboardUpdates.endsOn,
      text: dashboardUpdates.text,
      claudeStatus: dashboardUpdates.claudeStatus,
      claudeReply: dashboardUpdates.claudeReply,
    })
    .from(dashboardUpdates)
    .leftJoin(cities, eq(cities.id, dashboardUpdates.cityId))
    .where(and(isNull(dashboardUpdates.revokedAt), or(isNull(dashboardUpdates.claudeStatus), eq(dashboardUpdates.claudeStatus, "in_lavorazione"))))
    .orderBy(asc(dashboardUpdates.createdAt));
}

export async function setClaudeStatus(id: number, status: ClaudeStatus, reply: string | null) {
  const [row] = await db
    .update(dashboardUpdates)
    .set({ claudeStatus: status, claudeReply: reply, claudeAt: new Date() })
    .where(eq(dashboardUpdates.id, id))
    .returning({ id: dashboardUpdates.id });
  return !!row;
}

export async function revokeDashboardUpdate(id: number, by: string) {
  const [row] = await db
    .update(dashboardUpdates)
    .set({ revokedAt: new Date(), revokedBy: by })
    .where(eq(dashboardUpdates.id, id))
    .returning({ cityId: dashboardUpdates.cityId });
  const manual = await applyCityOverrides();
  // Nessuna decisione a mano rimasta: la città torna alla regola automatica (corse negli ultimi 365 giorni).
  if (row?.cityId && !manual.includes(row.cityId)) {
    await db.execute(sql`
      update cities c set active = exists (select 1 from rides r where r.city_id = c.id and r.start_time >= now() - interval '365 days')
      where c.id = ${row.cityId}`);
  }
}

export async function listDashboardUpdates(limit = 100) {
  return db
    .select({ update: dashboardUpdates, cityName: cities.name })
    .from(dashboardUpdates)
    .leftJoin(cities, eq(cities.id, dashboardUpdates.cityId))
    .orderBy(desc(dashboardUpdates.createdAt))
    .limit(limit);
}

/**
 * Porta in `cities.active` quello che hanno deciso i dipendenti e restituisce le città decise a mano,
 * che la regola automatica (365 giorni senza corse) non deve più toccare.
 */
export async function applyCityOverrides(): Promise<number[]> {
  const rows = await db.select().from(dashboardUpdates).where(isNull(dashboardUpdates.revokedAt));
  const overrides = cityOverrides(rows, localDay());
  const close = [...overrides].filter(([, s]) => s === "chiusa").map(([id]) => id);
  const open = [...overrides].filter(([, s]) => s === "attiva").map(([id]) => id);
  if (close.length) await db.update(cities).set({ active: false }).where(inArray(cities.id, close));
  if (open.length) await db.update(cities).set({ active: true }).where(inArray(cities.id, open));
  return [...overrides.keys()];
}

/** Note operative valide oggi, con la città, dalla più recente. */
export async function currentNotes() {
  const today = localDay();
  const rows = await db
    .select({ update: dashboardUpdates, cityName: cities.name })
    .from(dashboardUpdates)
    .leftJoin(cities, eq(cities.id, dashboardUpdates.cityId))
    .where(eq(dashboardUpdates.kind, "nota"))
    .orderBy(desc(dashboardUpdates.createdAt))
    .limit(200);
  return rows.filter((r) => noteIsCurrent(r.update, today, addDays(today, -7)));
}
