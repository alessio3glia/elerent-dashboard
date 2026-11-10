"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  await bootstrapAdmin(email, password);
  const [user] = await db.select().from(schema.appUsers).where(eq(schema.appUsers.email, email));
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Email o password non corrette" };
  }
  await createSession({ id: user.id, email: user.email, name: user.name, role: user.role as "admin" | "operatore" });
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/**
 * Accesso di emergenza: chi entra con ADMIN_EMAIL/ADMIN_PASSWORD delle variabili d'ambiente diventa (o resta) admin
 * con quella password. Al primo accesso crea l'amministratore; se la password admin è stata dimenticata basta
 * cambiare ADMIN_PASSWORD su Vercel, ridistribuire ed entrare con quella nuova.
 */
async function bootstrapAdmin(email: string, password: string) {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword || email !== adminEmail || password !== adminPassword) return;
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await db
    .insert(schema.appUsers)
    .values({ email: adminEmail, name: "Amministratore", passwordHash, role: "admin" })
    .onConflictDoUpdate({ target: schema.appUsers.email, set: { passwordHash, role: "admin" } });
}
