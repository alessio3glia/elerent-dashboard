"use client";

import { useActionState } from "react";
import { requestPasswordReset, resetPassword } from "@/app/actions/password-reset";

export function RequestResetForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  if (state?.ok) {
    return (
      <p className="rounded-xl border border-line bg-surface p-6 text-sm">
        Se l&apos;email ha un accesso alla dashboard, ti è arrivato un link per scegliere la nuova password. Vale 30 minuti:
        controlla anche lo spam.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4 rounded-xl border border-line bg-surface p-6">
      <label className="block">
        <span className="text-sm text-ink-2">Email</span>
        <input name="email" type="email" required autoComplete="email" className="input mt-1" />
      </label>
      {state?.error && <p className="text-sm text-critical">{state.error}</p>}
      <button disabled={pending} className="btn-primary w-full">
        {pending ? "Invio…" : "Mandami il link"}
      </button>
    </form>
  );
}

export function NewPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  return (
    <form action={action} className="space-y-4 rounded-xl border border-line bg-surface p-6">
      <input type="hidden" name="token" value={token} />
      <label className="block">
        <span className="text-sm text-ink-2">Nuova password</span>
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className="input mt-1" />
      </label>
      <label className="block">
        <span className="text-sm text-ink-2">Ripeti la password</span>
        <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input mt-1" />
      </label>
      {state?.error && <p className="text-sm text-critical">{state.error}</p>}
      <button disabled={pending} className="btn-primary w-full">
        {pending ? "Salvataggio…" : "Salva e accedi"}
      </button>
    </form>
  );
}
