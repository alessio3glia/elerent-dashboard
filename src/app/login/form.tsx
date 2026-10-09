"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4 rounded-xl border border-line bg-surface p-6">
      <label className="block">
        <span className="text-sm text-ink-2">Email</span>
        <input name="email" type="email" required autoComplete="email" className="input mt-1" />
      </label>
      <label className="block">
        <span className="text-sm text-ink-2">Password</span>
        <input name="password" type="password" required autoComplete="current-password" className="input mt-1" />
      </label>
      {state?.error && <p className="text-sm text-critical">{state.error}</p>}
      <button disabled={pending} className="btn-primary w-full">
        {pending ? "Accesso…" : "Accedi"}
      </button>
    </form>
  );
}
