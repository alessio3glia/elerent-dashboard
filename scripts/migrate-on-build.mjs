// Su Vercel applica le migrazioni del database prima del build. In locale senza DATABASE_URL non fa nulla.
import { execSync } from "node:child_process";

if (process.env.DATABASE_URL) {
  execSync("npx tsx scripts/migrate.mts", { stdio: "inherit" });
} else {
  console.log("DATABASE_URL non impostata: migrazioni saltate");
}
