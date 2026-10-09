import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { db?: Db; pg?: postgres.Sql };

function getDb(): Db {
  if (!globalForDb.db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL non impostata");
    globalForDb.pg = postgres(url, { max: 5, prepare: false });
    globalForDb.db = drizzle({ client: globalForDb.pg, schema });
  }
  return globalForDb.db;
}

/** Connessione creata alla prima query, così il build non richiede DATABASE_URL. */
export const db = new Proxy({} as Db, {
  get: (_t, prop) => {
    const real = getDb();
    const value = Reflect.get(real, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export async function closeDb() {
  await globalForDb.pg?.end();
  globalForDb.pg = undefined;
  globalForDb.db = undefined;
}

export { schema };
