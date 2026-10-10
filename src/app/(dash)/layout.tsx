import { and, eq, gte } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import { logout } from "@/app/actions/auth";
import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/auth/session";
import { resumeBackfillIfStalled } from "@/lib/backfill-chain";
import { liveSync } from "@/lib/live";
import { db, schema } from "@/lib/db";
import { addDays, localDay } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  // Se l'import dello storico si è fermato a metà, lo fa ripartire dopo aver mostrato la pagina.
  after(() => resumeBackfillIfStalled(origin).catch((error) => console.error("Ripresa import non riuscita", error)));
  // Corse nuove da Atom: se l'ultima sincronizzazione ha più di 2 minuti, la rifà dopo aver mostrato la pagina.
  after(() => liveSync().catch((error) => console.error("Sync in tempo reale non riuscita", error)));
  const open = await db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.status, "aperta"), gte(schema.tasks.day, addDays(localDay(), -7))));

  return (
    <div className="md:flex">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex h-full flex-col gap-4 p-4">
          <div className="px-3 pt-2 text-xl font-bold tracking-tight">
            ele<span className="text-brand">rent</span>
            <span className="ml-2 text-xs font-normal text-ink-3">monitor</span>
          </div>
          <Nav isAdmin={user.role === "admin"} openTasks={open.length} />
          <div className="mt-auto hidden border-t border-line px-3 pt-4 md:block">
            <div className="text-sm">{user.name}</div>
            <div className="text-xs text-ink-3">{user.role === "admin" ? "Amministratore" : "Operatore"}</div>
            <form action={logout}>
              <button className="mt-3 text-xs text-ink-2 hover:text-brand">Esci</button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
