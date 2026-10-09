import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { addDays } from "@/lib/dates";
import { evaluateCity, networkRidesPerVehicle } from "./engine";

const { cities, dailyMetrics, alerts, tasks } = schema;

/**
 * Genera alert e task del giorno `day` usando i KPI fino a `day - 1`.
 * Idempotente: rieseguirla non duplica nulla e non tocca task già lavorate.
 */
export async function generateDailyTasks(day: string) {
  const until = addDays(day, -1);
  const activeCities = await db.select().from(cities).where(eq(cities.active, true));
  const metricsByCity = new Map<number, (typeof dailyMetrics.$inferSelect)[]>();
  for (const city of activeCities) {
    metricsByCity.set(
      city.id,
      await db
        .select()
        .from(dailyMetrics)
        .where(and(eq(dailyMetrics.cityId, city.id), gte(dailyMetrics.day, addDays(until, -27)), lte(dailyMetrics.day, until)))
        .orderBy(asc(dailyMetrics.day)),
    );
  }
  const network = networkRidesPerVehicle([...metricsByCity.values()]);

  let created = 0;
  for (const city of activeCities) {
    const findings = evaluateCity(
      {
        name: city.name,
        affiliateName: city.affiliateName,
        contactName: city.contactName,
        lastContactAt: city.lastContactAt,
        metrics: metricsByCity.get(city.id) ?? [],
        networkRidesPerVehicle: network,
      },
      new Date(`${day}T08:00:00Z`),
    );
    for (const f of findings) {
      const [alert] = await db
        .insert(alerts)
        .values({ cityId: city.id, day, rule: f.rule, severity: f.severity, title: f.title, detail: f.detail, data: f.data ?? null })
        .onConflictDoUpdate({
          target: [alerts.cityId, alerts.day, alerts.rule],
          set: { severity: f.severity, title: f.title, detail: f.detail, data: f.data ?? null },
        })
        .returning();
      const inserted = await db
        .insert(tasks)
        .values({
          cityId: city.id,
          alertId: alert.id,
          day,
          rule: f.rule,
          kind: f.task.kind,
          priority: f.task.priority,
          title: f.task.title,
          reason: f.detail,
          action: f.task.action,
        })
        .onConflictDoNothing()
        .returning({ id: tasks.id });
      created += inserted.length;
    }
  }
  return { cities: activeCities.length, tasksCreated: created };
}
