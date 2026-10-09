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

/** Primo accesso: se non esiste ancora nessun utente, crea l'admin indicato nelle variabili d'ambiente. */
async function bootstrapAdmin(email: string, password: string) {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword || email !== adminEmail || password !== adminPassword) return;
  const [existing] = await db.select({ id: schema.appUsers.id }).from(schema.appUsers).limit(1);
  if (existing) return;
  await db.insert(schema.appUsers).values({
    email: adminEmail,
    name: "Amministratore",
    passwordHash: await bcrypt.hash(adminPassword, 10),
    role: "admin",
  });
}
