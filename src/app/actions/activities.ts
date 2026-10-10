"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activities";
import { requireUser } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";

/** Attività fatta fuori dalle task (es. "Ricaricati 12 veicoli a Messina"): entra spuntata nel registro di oggi. */
export async function addActivity(form: FormData) {
  const user = await requireUser();
  const title = String(form.get("title") ?? "").trim().slice(0, 300);
  if (!title) return;
  const cityId = Number(form.get("cityId")) || null;
  const note = String(form.get("note") ?? "").trim().slice(0, 1000) || null;
  await logActivity(user, { kind: "attivita", title, note, cityId });
  revalidatePath("/attivita");
}

/** Toglie un'attività aggiunta per sbaglio (solo le proprie, solo quelle aggiunte a mano). */
export async function removeActivity(form: FormData) {
  const user = await requireUser();
  const id = Number(form.get("id"));
  await db
    .delete(schema.activities)
    .where(and(eq(schema.activities.id, id), eq(schema.activities.userId, user.id), eq(schema.activities.kind, "attivita")));
  revalidatePath("/attivita");
}
