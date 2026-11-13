"use server";

import bcrypt from "bcryptjs";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";

type State = { error?: string; ok?: string } | undefined;

const optionalText = z.string().trim().transform((s) => s || null);
const optionalDay = z
  .string()
  .trim()
  .transform((s) => s || null)
  .refine((s) => s === null || /^\d{4}-\d{2}-\d{2}$/.test(s));

const InvestorSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().optional().transform((s) => s?.trim() || null),
  sharePct: z
    .string()
    .trim()
    .transform((s) => (s ? Number(s.replace(",", ".")) : null))
    .refine((n) => n === null || (Number.isFinite(n) && n >= 0 && n <= 100)),
  note: optionalText,
});

/** Crea o aggiorna un investitore. La password serve solo alla creazione; in modifica, vuota = resta quella di prima. */
export async function saveInvestor(_prev: State, form: FormData): Promise<State> {
  await requireAdmin();
  const parsed = InvestorSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Controlla i campi: nome, email valida e quota tra 0 e 100." };
  const { id, password, ...data } = parsed.data;
  if (password && password.length < 8) return { error: "La password deve avere almeno 8 caratteri." };
  if (!id && !password) return { error: "Serve una password (almeno 8 caratteri) per il primo accesso." };

  const [staff] = await db.select({ id: schema.appUsers.id }).from(schema.appUsers).where(eq(schema.appUsers.email, data.email));
  if (staff) return { error: "Questa email è già di un dipendente: usa un'altra email per l'investitore." };
  const [dup] = await db
    .select({ id: schema.investors.id })
    .from(schema.investors)
    .where(id ? and(eq(schema.investors.email, data.email), ne(schema.investors.id, Number(id))) : eq(schema.investors.email, data.email));
  if (dup) return { error: "Esiste già un investitore con questa email." };

  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
  if (id) {
    await db.update(schema.investors).set({ ...data, ...(passwordHash ? { passwordHash } : {}) }).where(eq(schema.investors.id, Number(id)));
    revalidatePath("/investitori");
    return { ok: passwordHash ? "Salvato, password cambiata" : "Salvato" };
  }
  const [created] = await db.insert(schema.investors).values({ ...data, passwordHash }).returning({ id: schema.investors.id });
  revalidatePath("/investitori");
  redirect(`/investitori/${created.id}`);
}

export async function deleteInvestor(form: FormData) {
  await requireAdmin();
  await db.delete(schema.investors).where(eq(schema.investors.id, Number(form.get("id"))));
  revalidatePath("/investitori");
  redirect("/investitori");
}

/**
 * Assegna veicoli a un investitore: si scrivono i numeri dei veicoli (come in Atom) o gli ID Atom,
 * separati da virgole, spazi o a capo. Un veicolo già di un altro investitore (senza data di fine) non si assegna.
 */
export async function assignVehicles(_prev: State, form: FormData): Promise<State> {
  await requireAdmin();
  const investorId = Number(form.get("investorId"));
  const day = optionalDay.safeParse(String(form.get("fromDay") ?? ""));
  if (!day.success) return { error: "Data non valida." };
  const codes = [...new Set(String(form.get("vehicles") ?? "").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];
  if (!investorId || codes.length === 0) return { error: "Scrivi almeno un numero di veicolo." };

  const added: string[] = [];
  const missing: string[] = [];
  const taken: string[] = [];
  for (const code of codes) {
    const [vehicle] = await db
      .select({ atomId: schema.vehicles.atomId, number: schema.vehicles.number })
      .from(schema.vehicles)
      .where(sql`lower(${schema.vehicles.number}) = lower(${code})${/^\d+$/.test(code) ? sql` or ${schema.vehicles.atomId} = ${Number(code)}` : sql``}`)
      .orderBy(sql`(lower(${schema.vehicles.number}) = lower(${code})) desc`)
      .limit(1);
    if (!vehicle) {
      missing.push(code);
      continue;
    }
    const [owner] = await db
      .select({ investorId: schema.investorVehicles.investorId, name: schema.investors.name })
      .from(schema.investorVehicles)
      .innerJoin(schema.investors, eq(schema.investors.id, schema.investorVehicles.investorId))
      .where(and(eq(schema.investorVehicles.vehicleAtomId, vehicle.atomId), isNull(schema.investorVehicles.toDay)));
    if (owner) {
      if (owner.investorId !== investorId) taken.push(`${code} (di ${owner.name})`);
      continue;
    }
    await db.insert(schema.investorVehicles).values({ investorId, vehicleAtomId: vehicle.atomId, fromDay: day.data });
    added.push(vehicle.number ?? code);
  }
  revalidatePath(`/investitori/${investorId}`);
  const parts = [
    added.length ? `Aggiunti: ${added.join(", ")}` : null,
    missing.length ? `Non trovati in Atom: ${missing.join(", ")}` : null,
    taken.length ? `Già assegnati: ${taken.join(", ")}` : null,
  ].filter(Boolean);
  return added.length ? { ok: parts.join(" · ") } : { error: parts.join(" · ") || "Nessun veicolo aggiunto" };
}

/** Cambia il periodo di possesso di un veicolo (es. venduto: si mette la data di fine e le corse dopo non contano). */
export async function updateVehiclePeriod(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  const from = optionalDay.safeParse(String(form.get("fromDay") ?? ""));
  const to = optionalDay.safeParse(String(form.get("toDay") ?? ""));
  if (!from.success || !to.success) return;
  const [row] = await db
    .update(schema.investorVehicles)
    .set({ fromDay: from.data, toDay: to.data })
    .where(eq(schema.investorVehicles.id, id))
    .returning({ investorId: schema.investorVehicles.investorId });
  if (row) revalidatePath(`/investitori/${row.investorId}`);
}

export async function removeVehicle(form: FormData) {
  await requireAdmin();
  const [row] = await db
    .delete(schema.investorVehicles)
    .where(eq(schema.investorVehicles.id, Number(form.get("id"))))
    .returning({ investorId: schema.investorVehicles.investorId });
  if (row) revalidatePath(`/investitori/${row.investorId}`);
}
