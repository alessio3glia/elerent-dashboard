"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activities";
import { requireAdmin, requireUser } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { fillTemplate, getRecoverySettings, saveRecoverySettings, sendDue, sendEmail, sendNextForCase, type RecoverySettings } from "@/lib/recovery";

export type ActionState = { ok?: string; error?: string } | null;

const text = (form: FormData, key: string, max = 5000) => String(form.get(key) ?? "").trim().slice(0, max);

export async function saveRecovery(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const templates = [1, 2, 3].map((i) => ({ subject: text(form, `subject${i}`, 200), body: text(form, `body${i}`) }));
  if (templates.some((t) => !t.subject || !t.body)) return { error: "Oggetto e testo delle 3 email sono obbligatori" };
  const settings: RecoverySettings = {
    templates: templates as RecoverySettings["templates"],
    delayDays: Math.min(60, Math.max(1, Number(form.get("delayDays")) || 7)),
    minDebt: Math.max(0, Number(String(form.get("minDebt")).replace(",", ".")) || 1),
    dailyLimit: Math.min(1000, Math.max(1, Number(form.get("dailyLimit")) || 90)),
    auto: form.get("auto") === "on",
  };
  await saveRecoverySettings(settings);
  revalidatePath("/recupero");
  return { ok: settings.auto ? "Salvato. Invio automatico attivo: ogni mattina partono le email in scadenza." : "Salvato." };
}

/** Prova: manda la email di una fase all'indirizzo di chi è collegato, con dati di esempio. */
export async function sendTestEmail(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const stage = Math.min(3, Math.max(1, Number(form.get("stage")) || 1));
  const settings = await getRecoverySettings();
  const { subject, body } = fillTemplate(settings.templates[stage - 1], { nome: user.name, importo: 12.5, citta: "Messina" });
  try {
    await sendEmail(user.email, `[PROVA] ${subject}`, body);
    return { ok: `Prova della email ${stage} inviata a ${user.email}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function sendCase(form: FormData) {
  const user = await requireUser();
  const id = Number(form.get("id"));
  const result = await sendNextForCase(id, user);
  if ("sent" in result && result.sent) await logActivity(user, { kind: "attivita", title: `Email di sollecito ${result.sent} inviata (pratica ${id})` });
  revalidatePath("/recupero");
}

export async function sendAllDue(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (form.get("confirm") !== "on") return { error: "Spunta la conferma prima di inviare" };
  const r = await sendDue(user.name);
  if (r.sent) await logActivity(user, { kind: "attivita", title: `Inviate ${r.sent} email di sollecito pagamento` });
  revalidatePath("/recupero");
  return r.errors && !r.sent
    ? { error: `Nessuna email inviata, ${r.errors} errori: controlla lo storico in fondo alla pagina` }
    : { ok: `Inviate ${r.sent} email${r.skipped ? `, ${r.skipped} saltate (debito già pagato o non verificato)` : ""}${r.errors ? `, ${r.errors} errori` : ""}${r.limit ? ". Raggiunto il limite di oggi." : "."}` };
}

export async function setCaseExcluded(form: FormData) {
  await requireUser();
  const id = Number(form.get("id"));
  const exclude = form.get("exclude") === "1";
  await db.update(schema.debtCases).set({ status: exclude ? "esclusa" : "aperta" }).where(eq(schema.debtCases.id, id));
  revalidatePath("/recupero");
}
