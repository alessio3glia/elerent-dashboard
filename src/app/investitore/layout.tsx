import { logout } from "@/app/actions/auth";
import { requireInvestor } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Area degli investitori: niente menu della dashboard interna, solo i propri veicoli. */
export default async function InvestorLayout({ children }: LayoutProps<"/investitore">) {
  const user = await requireInvestor();
  return (
    <div className="min-h-screen">
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
