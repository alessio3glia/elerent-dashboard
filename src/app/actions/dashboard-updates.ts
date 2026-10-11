"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activities";
import { requireUser } from "@/lib/auth/session";
import { addDashboardUpdate, revokeDashboardUpdate } from "@/lib/dashboard-updates";
import { UPDATE_KINDS, isUpdateKind } from "@/lib/dashboard-updates-rules";
import { localDay } from "@/lib/dates";

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Salva un aggiornamento: vale subito per tutta la dashboard e finisce nel registro attività. */
export async function saveDashboardUpdate(_prev: { error?: string; ok?: boolean } | undefined, form: FormData) {
  const user = await requireUser();
  const text = String(form.get("text") ?? "").trim().slice(0, 1000);
  const kind = form.get("kind");
  const cityId = Number(form.get("cityId")) || null;
  const startsOn = isDay(form.get("startsOn")) ? String(form.get("startsOn")) : localDay();
  const endsOn = isDay(form.get("endsOn")) ? String(form.get("endsOn")) : null;
  if (!text) return { error: "Scrivi cosa è cambiato." };
  if (!isUpdateKind(kind)) return { error: "Scegli il tipo di aggiornamento." };
  const meta = UPDATE_KINDS[kind];
  if (meta.needsCity && !cityId) return { error: "Scegli la città." };
  if (kind === "citta_sospesa" && !endsOn) return { error: "Per una sospensione serve la data di fine." };
  if (endsOn && endsOn < startsOn) return { error: "La data di fine è prima dell'inizio." };
  await addDashboardUpdate({ user, kind, cityId, startsOn, endsOn: meta.hasEnd ? endsOn : null, text });
  await logActivity(user, { kind: "attivita", title: `Aggiornamento dashboard: ${meta.label}`, note: text, cityId });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Annulla un aggiornamento sbagliato: la città torna allo stato precedente. */
export async function revokeUpdate(form: FormData) {
  const user = await requireUser();
  const id = Number(form.get("id"));
  if (id) await revokeDashboardUpdate(id, user.name);
  revalidatePath("/", "layout");
}
