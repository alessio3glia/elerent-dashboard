"use client";

import { useActionState } from "react";
import { assignVehicles, saveInvestor } from "@/app/actions/investors";
import type { Investor } from "@/lib/db/schema";

function Field({ label, name, defaultValue, type = "text", placeholder, required, hint }: { label: string; name: string; defaultValue?: string | number | null; type?: string; placeholder?: string; required?: boolean; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-ink-3">{label}</span>
      <input name={name} type={type} step="any" defaultValue={defaultValue ?? ""} placeholder={placeholder} required={required} className="input mt-1" />
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export function InvestorForm({ investor }: { investor?: Investor }) {
  const [state, action, pending] = useActionState(saveInvestor, undefined);
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {investor && <input type="hidden" name="id" value={investor.id} />}
      <Field label="Nome" name="name" defaultValue={investor?.name} required />
      <Field label="Email (per entrare)" name="email" type="email" defaultValue={investor?.email} required />
      <Field
        label={investor ? "Nuova password (vuota = invariata)" : "Password (min. 8)"}
        name="password"
        type="password"
        required={!investor}
      />
      <Field label="Quota investitore sul lordo (%)" name="sharePct" type="number" defaultValue={investor?.sharePct} placeholder="es. 50" hint="Vuota: vede solo il lordo" />
      <div className="sm:col-span-2 lg:col-span-3">
        <Field label="Note interne (l'investitore non le vede)" name="note" defaultValue={investor?.note} />
      </div>
      <div className="flex items-end gap-3">
        <button disabled={pending} className="btn-primary">{investor ? "Salva" : "Crea investitore"}</button>
        {state?.ok && <span className="text-xs text-brand">{state.ok}</span>}
        {state?.error && <span className="text-xs text-critical">{state.error}</span>}
      </div>
    </form>
  );
}

export function AssignVehiclesForm({ investorId }: { investorId: number }) {
  const [state, action, pending] = useActionState(assignVehicles, undefined);
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
      <input type="hidden" name="investorId" value={investorId} />
      <label className="block">
        <span className="text-xs text-ink-3">Numeri dei veicoli (come in Atom) o ID Atom, separati da virgola o a capo</span>
        <textarea name="vehicles" rows={2} required className="input mt-1" placeholder="es. 102345, 102346" />
      </label>
      <Field label="Suoi dal (vuoto = da sempre)" name="fromDay" type="date" />
      <div className="flex items-end">
        <button disabled={pending} className="btn-primary">Assegna</button>
      </div>
      {(state?.ok || state?.error) && (
        <p className={`text-xs sm:col-span-3 ${state?.error ? "text-critical" : "text-brand"}`}>{state.ok ?? state.error}</p>
      )}
    </form>
  );
}
