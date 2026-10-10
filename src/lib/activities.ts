import "server-only";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { localDay } from "@/lib/dates";

const { activities, cities } = schema;

/** Annota nel registro un'azione fatta da un dipendente. */
export async function logActivity(
  user: SessionUser,
  entry: { kind: string; title: string; note?: string | null; cityId?: number | null; taskId?: number | null },
) {
  await db.insert(activities).values({
    userId: user.id,
    userName: user.name,
    day: localDay(),
    kind: entry.kind,
    title: entry.title,
    note: entry.note ?? null,
    cityId: entry.cityId ?? null,
    taskId: entry.taskId ?? null,
  });
}

/** Registro di un giorno, dal più vecchio, con città. */
export async function activitiesOfDay(day: string) {
  return db
    .select({ activity: activities, cityName: cities.name })
    .from(activities)
    .leftJoin(cities, eq(cities.id, activities.cityId))
    .where(eq(activities.day, day))
    .orderBy(asc(activities.at));
}

/** Notifiche inviate nel giorno (tabella della pagina Notifiche), da mostrare nel registro. */
export async function notificationsOfDay(day: string) {
  return db.execute<{ id: number; title: string; segment: string; recipients: number; test: boolean; status: string; sent_by: string; created_at: Date }>(sql`
    select id, title, segment, recipients, test, status, sent_by, created_at
    from notifications
    where created_at >= (${day}::date::timestamp at time zone 'Europe/Rome')
      and created_at < ((${day}::date + 1)::timestamp at time zone 'Europe/Rome')
    order by created_at`);
}

/** Giorni con attività negli ultimi 30 giorni, per dipendente: quante task fatte e quante attività. */
export async function recentDays(from: string) {
  return db
    .select({
      day: activities.day,
      userName: activities.userName,
      done: sql<number>`count(*) filter (where ${activities.kind} in ('task_fatta', 'attivita'))::int`,
      skipped: sql<number>`count(*) filter (where ${activities.kind} = 'task_saltata')::int`,
    })
    .from(activities)
    .where(and(gte(activities.day, from)))
    .groupBy(activities.day, activities.userName)
    .orderBy(desc(activities.day), asc(activities.userName));
}
