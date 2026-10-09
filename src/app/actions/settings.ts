"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { localDay } from "@/lib/dates";
import { recomputeAll } from "@/lib/pipeline";
import { generateDailyTasks } from "@/lib/rules/run";

const optionalText = z.string().trim().transform((s) => s || null);
const optionalNumber = z.string().trim().transform((s) => (s ? Number(s.replace(",", ".")) : null));

const CitySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1),
  affiliateName: optionalText,
  contactName: optionalText,
  contactPhone: optionalText,
  contactEmail: optionalText,
  centerLat: optionalNumber,
  centerLng: optionalNumber,
  radiusKm: z.coerce.number().positive().default(15),
  revenueSharePct: z.coerce.number().min(0).max(100),
  feePerVehicleMonth: z.coerce.number().min(0),
  active: z.string().optional().transform((v) => v === "on"),
});

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function saveCity(_prev: { error?: string; ok?: boolean } | undefined, form: FormData) {
  await requireAdmin();
  const parsed = CitySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Controlla i campi: nome, percentuale e fee sono obbligatori." };
  const { id, ...data } = parsed.data;
  if (id) {
    await db.update(schema.cities).set(data).where(eq(schema.cities.id, Number(id)));
  } else {
    await db.insert(schema.cities).values({ ...data, slug: slugify(data.name) });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

const UserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1),
  password: z.string().min(8),
  role: z.enum(["admin", "operatore"]),
});

export async function saveUser(_prev: { error?: string; ok?: boolean } | undefined, form: FormData) {
  await requireAdmin();
  const parsed = UserSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Email valida, nome e password di almeno 8 caratteri." };
  const { password, ...rest } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);
  await db
    .insert(schema.appUsers)
    .values({ ...rest, passwordHash })
    .onConflictDoUpdate({ target: schema.appUsers.email, set: { name: rest.name, role: rest.role, passwordHash } });
  revalidatePath("/impostazioni");
  return { ok: true };
}

export async function deleteUser(form: FormData) {
  const me = await requireAdmin();
  const id = Number(form.get("id"));
  if (id !== me.id) await db.delete(schema.appUsers).where(eq(schema.appUsers.id, id));
  revalidatePath("/impostazioni");
}

/** Dopo aver cambiato aree, % o fee: ricalcola KPI e task senza chiamare Atom. */
export async function recompute() {
  await requireAdmin();
  await recomputeAll();
  await generateDailyTasks(localDay());
  revalidatePath("/", "layout");
}
