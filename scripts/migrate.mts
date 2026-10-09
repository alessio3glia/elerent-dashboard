import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, db } from "@/lib/db";

await migrate(db, { migrationsFolder: "drizzle" });
console.log("Migrazioni applicate");
await closeDb();
