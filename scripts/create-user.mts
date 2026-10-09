// Uso: npm run user:create -- email@elerent.com "Nome Cognome" password [admin|operatore]
import bcrypt from "bcryptjs";
import { closeDb, db, schema } from "@/lib/db";

const [email, name, password, role = "operatore"] = process.argv.slice(2);
if (!email || !name || !password) {
  console.error('Uso: npm run user:create -- email "Nome" password [admin|operatore]');
  process.exit(1);
}
await db
  .insert(schema.appUsers)
  .values({ email: email.toLowerCase(), name, passwordHash: await bcrypt.hash(password, 10), role })
  .onConflictDoUpdate({ target: schema.appUsers.email, set: { name, passwordHash: await bcrypt.hash(password, 10), role } });
console.log(`Utente ${email} (${role}) salvato`);
await closeDb();
