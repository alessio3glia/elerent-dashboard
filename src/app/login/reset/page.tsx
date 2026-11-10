import Link from "next/link";
import { isResetTokenValid } from "@/app/actions/password-reset";
import { NewPasswordForm, RequestResetForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = token ? await isResetTokenValid(token) : false;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl font-bold tracking-tight">
            ele<span className="text-brand">rent</span>
          </div>
          <p className="mt-2 text-sm text-ink-2">{valid ? "Scegli la nuova password" : "Password dimenticata"}</p>
        </div>
        {token && !valid && (
          <p className="mb-4 text-sm text-critical">Il link è scaduto o è già stato usato: chiedine uno nuovo qui sotto.</p>
        )}
        {valid && token ? <NewPasswordForm token={token} /> : <RequestResetForm />}
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-ink-2 underline">
            Torna al login
          </Link>
        </p>
      </div>
    </main>
  );
}
