"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activities";
import { requireUser } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";

export async function completeTask(form: FormData) {
  const user = await requireUser();
  const id = Number(form.get("id"));
  const status = form.get("status") === "saltata" ? "saltata" : form.get("status") === "aperta" ? "aperta" : "fatta";
  const note = String(form.get("note") ?? "").trim() || null;
  const [task] = await db
    .update(schema.tasks)
    .set({
      status,
      note,
      completedBy: status === "aperta" ? null : user.name,
      completedAt: status === "aperta" ? null : new Date(),
    })
    .where(eq(schema.tasks.id, id))
    .returning();
  // Ogni spunta finisce nel registro attività del giorno, con l'esito scritto.
  // Riaprirla toglie la spunta dal registro, così il resoconto conta solo il lavoro rimasto fatto.
  if (task && status === "aperta") {
    await db.delete(schema.activities).where(and(eq(schema.activities.taskId, task.id), inArray(schema.activities.kind, ["task_fatta", "task_saltata"])));
  } else if (task) {
    await logActivity(user, { kind: `task_${status}`, title: task.title, note, cityId: task.cityId, taskId: task.id });
  }
  // Una chiamata fatta conta come contatto con l'affiliato
  if (task && status === "fatta" && task.kind === "chiamata") {
    await db.update(schema.cities).set({ lastContactAt: new Date() }).where(eq(schema.cities.id, task.cityId));
  }
  revalidatePath("/", "layout");
}
