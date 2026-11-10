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
    // Messaggi precisi: la dashboard ha pochi utenti interni e capire cosa non va conta più che nascondere chi ha un accesso.
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (adminEmail && email === adminEmail) {
      return { error: "Email admin giusta, ma la password non è quella di ADMIN_PASSWORD su Vercel. Se l'hai appena cambiata, fai Redeploy e riprova." };
    }
    if (!user) return { error: "Nessun accesso con questa email: controlla di usare quella scritta in ADMIN_EMAIL su Vercel." };
    return { error: "Password sbagliata per questa email." };
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
  // Spazi o a capo incollati per sbaglio nella variabile su Vercel non devono bloccare l'accesso.
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!adminEmail || !adminPassword || email !== adminEmail || password.trim() !== adminPassword) return;
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await db
    .insert(schema.appUsers)
    .values({ email: adminEmail, name: "Amministratore", passwordHash, role: "admin" })
    .onConflictDoUpdate({ target: schema.appUsers.email, set: { passwordHash, role: "admin" } });
}
