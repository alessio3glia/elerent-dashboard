import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { addDays } from "@/lib/dates";
import { evaluateCity, networkRidesPerVehicle, type Finding } from "./engine";
import { MAX_TASKS_PER_DAY, marketingTasks, planDay } from "./plan";

const { cities, dailyMetrics, alerts, tasks } = schema;

/**
 * Genera alert e task del giorno `day` usando i KPI fino a `day - 1`.
 * Le task sono al massimo 30, dalle più importanti, con ogni giorno anche le task di notifiche e marketing;
 * quelle meno urgenti (es. chiamate di routine) restano fuori e si ripropongono il giorno dopo.
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

  // Prima gli alert (tutti, restano nella pagina Alert), poi il piano del giorno: massimo 30 task.
  const findings: { cityId: number; revenue: number; finding: Finding }[] = [];
  const alertIds = new Map<string, number>();
  for (const city of activeCities) {
    const metrics = metricsByCity.get(city.id) ?? [];
    const evaluated = evaluateCity(
      {
        name: city.name,
        affiliateName: city.affiliateName,
        contactName: city.contactName,
        lastContactAt: city.lastContactAt,
        metrics,
        networkRidesPerVehicle: network,
      },
      new Date(`${day}T08:00:00Z`),
    );
    const revenue = metrics.slice(-7).reduce((a, d) => a + (d.revenue ?? 0), 0);
    for (const f of evaluated) {
      const [alert] = await db
        .insert(alerts)
        .values({ cityId: city.id, day, rule: f.rule, severity: f.severity, title: f.title, detail: f.detail, data: f.data ?? null })
        .onConflictDoUpdate({
          target: [alerts.cityId, alerts.day, alerts.rule],
          set: { severity: f.severity, title: f.title, detail: f.detail, data: f.data ?? null },
        })
        .returning();
      alertIds.set(`${city.id}:${f.rule}`, alert.id);
      findings.push({ cityId: city.id, revenue, finding: f });
    }
  }

  // Rieseguire la generazione non duplica: si contano le task già create oggi e si saltano le stesse regole.
  const existing = await db.select({ cityId: tasks.cityId, rule: tasks.rule }).from(tasks).where(eq(tasks.day, day));
  const have = new Set(existing.map((t) => `${t.cityId ?? "rete"}:${t.rule}`));
  const [debts] = await db.execute<{ n: number; amount: number }>(sql`
    select count(*)::int as n, coalesce(sum(current_debt), 0)::float as amount from debt_cases where status = 'aperta'`);
  const marketing = marketingTasks(day, { openDebts: debts?.n ?? 0, openDebtAmount: debts?.amount ?? 0 });
  const plan = planDay(marketing, findings, MAX_TASKS_PER_DAY).filter((t) => !have.has(`${t.cityId ?? "rete"}:${t.rule}`));

  let created = 0;
  for (const t of plan.slice(0, Math.max(0, MAX_TASKS_PER_DAY - existing.length))) {
    const inserted = await db
      .insert(tasks)
      .values({
        cityId: t.cityId,
        alertId: t.alertKey ? (alertIds.get(t.alertKey) ?? null) : null,
        day,
        rule: t.rule,
        kind: t.kind,
        priority: t.priority,
        title: t.title,
        reason: t.reason,
        action: t.action,
      })
      .onConflictDoNothing()
      .returning({ id: tasks.id });
    created += inserted.length;
  }
  return { cities: activeCities.length, tasksCreated: created, postponed: Math.max(0, findings.length + marketing.length - MAX_TASKS_PER_DAY) };
}
