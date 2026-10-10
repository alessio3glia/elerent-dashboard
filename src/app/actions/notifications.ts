"use server";

import { and, desc, eq, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { SEGMENTS, segmentRecipients, type Segment } from "@/lib/customers";
import { db, schema } from "@/lib/db";
import { aiSuggestions } from "@/lib/notification-ai";
import { pickSuggestions, placeholders, type Suggestion } from "@/lib/notification-suggestions";
import { oneSignalConfig, sendPush } from "@/lib/onesignal";

export type SendState = { ok?: string; error?: string } | undefined;

const Form = z.object({
  segment: z.string().refine((s) => s in SEGMENTS),
  cityId: z.string().optional().transform((v) => (v ? Number(v) : undefined)),
  title: z.string().trim().min(1).max(65),
  body: z.string().trim().min(1).max(240),
  mode: z.enum(["prova", "invio"]),
  confirm: z.string().optional(),
  expected: z.coerce.number().optional(),
});

export async function sendNotification(_prev: SendState, form: FormData): Promise<SendState> {
  const user = await requireUser();
  const parsed = Form.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Titolo (max 65 caratteri) e testo (max 240) sono obbligatori." };
  const { segment, cityId, title, body, mode } = parsed.data;
  const missing = placeholders(`${title} ${body}`);
  if (missing.length) return { error: `Completa prima le parti tra parentesi: ${missing.join(", ")}.` };
  const cfg = oneSignalConfig();
  if (!cfg.configured) return { error: "OneSignal non è ancora collegato: servono ONESIGNAL_APP_ID e ONESIGNAL_REST_API_KEY su Vercel." };

  let externalIds: string[] = [];
  if (mode === "invio") {
    if (parsed.data.confirm !== "on") return { error: "Spunta la conferma prima di inviare agli utenti." };
    const rows = await segmentRecipients(segment as Segment, cityId);
    externalIds = [...new Set(rows.map((r) => (cfg.externalIdField === "atom_id" ? String(r.id) : r[cfg.externalIdField])).filter((v): v is string => Boolean(v)))];
    if (!externalIds.length) return { error: "Nessun destinatario in questo segmento." };
    // Se nel frattempo il segmento è cambiato, si fa riconfermare il numero
    if (parsed.data.expected !== undefined && parsed.data.expected !== externalIds.length) {
      return { error: `Il segmento ora ha ${externalIds.length} destinatari invece di ${parsed.data.expected}: ricarica la pagina e riconferma.` };
    }
    // Evita doppi invii dello stesso messaggio allo stesso segmento
    const [dup] = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(and(
        eq(schema.notifications.segment, segment),
        eq(schema.notifications.title, title),
        eq(schema.notifications.body, body),
        eq(schema.notifications.test, false),
        gte(schema.notifications.createdAt, new Date(Date.now() - 24 * 3600_000)),
      ))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(1);
    if (dup) return { error: "Questo stesso messaggio è già stato inviato a questo segmento nelle ultime 24 ore." };
  }

  const test = mode === "prova";
  const [row] = await db
    .insert(schema.notifications)
    .values({ segment, cityId, title, body, test, status: "in_invio", recipients: test ? cfg.testIds.length : externalIds.length, sentBy: user.name })
    .returning({ id: schema.notifications.id });
  try {
    const res = await sendPush(title, body, test ? { test: true } : { externalIds });
    await db
      .update(schema.notifications)
      .set({ status: res.ids.length ? "inviata" : "errore", onesignalIds: res.ids, error: res.errors.join("; ") || null })
      .where(eq(schema.notifications.id, row.id));
    revalidatePath("/notifiche");
    if (!res.ids.length) return { error: `OneSignal non ha inviato nulla: ${res.errors.join("; ") || "nessun destinatario iscritto"}.` };
    const note = res.errors.length ? ` (${res.errors.join("; ")})` : "";
    return { ok: test ? `Prova inviata ai dispositivi di test${note}.` : `Notifica inviata a ${externalIds.length} utenti${note}.` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(schema.notifications).set({ status: "errore", error: msg }).where(eq(schema.notifications.id, row.id));
    revalidatePath("/notifiche");
    return { error: msg };
  }
}

const RegenForm = z.object({
  segment: z.string().refine((s) => s in SEGMENTS),
  cityName: z.string().optional(),
  shown: z.array(z.object({ title: z.string(), body: z.string() })).max(30),
});

/** Nuove idee di testo per il pulsante "Rigenera": da Claude se configurato, altrimenti dal catalogo. */
export async function regenerateSuggestions(input: z.input<typeof RegenForm>): Promise<{ suggestions: Suggestion[]; source: "ai" | "catalogo" }> {
  await requireUser();
  const { segment, cityName, shown } = RegenForm.parse(input);
  const seg = SEGMENTS[segment as Segment];
  const ai = await aiSuggestions({ segmentLabel: seg.label, segmentDescription: seg.description, goal: seg.push, cityName, avoid: shown });
  if (ai) return { suggestions: ai, source: "ai" };
  return { suggestions: pickSuggestions(segment, cityName, shown.map((s) => s.title)), source: "catalogo" };
}
