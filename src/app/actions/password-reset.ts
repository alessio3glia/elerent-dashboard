"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { emailConfig, sendEmail } from "@/lib/recovery";

const TTL_MIN = 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET mancante o più corta di 32 caratteri");
  return new TextEncoder().encode(s);
}

/** Impronta della password attuale: il link smette di valere appena la password cambia, quindi si usa una volta sola. */
const fingerprint = (passwordHash: string | null) => (passwordHash ?? "nuovo").slice(-12);

const adminEmail = () => process.env.ADMIN_EMAIL?.trim().toLowerCase() || null;

async function findUser(email: string) {
  const [user] = await db.select().from(schema.appUsers).where(eq(schema.appUsers.email, email));
  return user ?? null;
}

/** Password dimenticata: manda per email un link valido 30 minuti. Vale per gli utenti della dashboard e per ADMIN_EMAIL. */
export async function requestPasswordReset(_prev: { ok?: boolean; error?: string } | undefined, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Scrivi la tua email" };
  if (!emailConfig().ready) return { error: "Invio email non configurato (RESEND_API_KEY o RECOVERY_FROM_EMAIL mancanti su Vercel)" };
  const user = await findUser(email);
  if (user || email === adminEmail()) {
    const token = await new SignJWT({ email, fp: fingerprint(user?.passwordHash ?? null), purpose: "reset" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${TTL_MIN}m`)
      .sign(secret());
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
    const link = `${origin}/login/reset?token=${encodeURIComponent(token)}`;
    try {
      await sendEmail(
        email,
        "Elerent dashboard: reimposta la password",
        `Per scegliere una nuova password della dashboard Elerent apri questo link entro ${TTL_MIN} minuti:\n\n${link}\n\nSe non l'hai chiesto tu, ignora questa email.`,
      );
    } catch (error) {
      console.error("Email di reset non inviata", error);
      return { error: "Email non inviata, riprova tra poco" };
    }
  }
  // Stessa risposta che l'email esista o no, per non rivelare chi ha un accesso.
  return { ok: true };
}

async function readToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "reset" || typeof payload.email !== "string") return null;
    const user = await findUser(payload.email);
    if (fingerprint(user?.passwordHash ?? null) !== payload.fp) return null;
    if (!user && payload.email !== adminEmail()) return null;
    return { email: payload.email, user };
  } catch {
    return null;
  }
}

export async function isResetTokenValid(token: string) {
  return (await readToken(token)) !== null;
}

/** Salva la nuova password e fa entrare subito. */
export async function resetPassword(_prev: { error?: string } | undefined, form: FormData) {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "La password deve avere almeno 8 caratteri" };
  if (password !== String(form.get("confirm") ?? "")) return { error: "Le due password non coincidono" };
  const found = await readToken(token);
  if (!found) return { error: "Link scaduto o già usato: chiedine uno nuovo" };
  const passwordHash = await bcrypt.hash(password, 10);
  const isAdmin = found.email === adminEmail();
  const [user] = found.user
    ? await db
        .update(schema.appUsers)
        .set({ passwordHash, ...(isAdmin ? { role: "admin" } : {}) })
        .where(eq(schema.appUsers.id, found.user.id))
        .returning()
    : await db.insert(schema.appUsers).values({ email: found.email, name: "Amministratore", passwordHash, role: "admin" }).returning();
  await createSession({ id: user.id, email: user.email, name: user.name, role: user.role as "admin" | "operatore" });
  redirect("/");
}
