import { logout } from "@/app/actions/auth";
import { backToAdmin } from "@/app/actions/investors";
import { requireInvestor } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Area degli investitori: niente menu della dashboard interna, solo i propri veicoli. */
export default async function InvestorLayout({ children }: LayoutProps<"/investitore">) {
  const user = await requireInvestor();
  return (
    <div className="min-h-screen">
      {user.asAdminId && (
        <div className="flex flex-wrap items-center justify-center gap-3 bg-brand px-4 py-2 text-sm font-medium text-black">
          Stai vedendo la dashboard come {user.name}: è esattamente quello che vede l&apos;investitore.
          <form action={backToAdmin}>
            <button className="rounded-md bg-black px-3 py-1 text-xs font-semibold text-brand">Torna alla dashboard Elerent</button>
          </form>
        </div>
      )}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div className="text-xl font-bold tracking-tight">
            ele<span className="text-brand">rent</span>
            <span className="ml-2 text-xs font-normal text-ink-3">investitori</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-ink-2">{user.name}</span>
            <form action={logout}>
              <button className="text-xs text-ink-2 hover:text-brand">Esci</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
