"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
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
  // Una chiamata fatta conta come contatto con l'affiliato
  if (task && status === "fatta" && task.kind === "chiamata") {
    await db.update(schema.cities).set({ lastContactAt: new Date() }).where(eq(schema.cities.id, task.cityId));
  }
  revalidatePath("/", "layout");
}
