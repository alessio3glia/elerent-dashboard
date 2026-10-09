"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
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
