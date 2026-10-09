"use client";

import { useActionState } from "react";
import { saveCity, saveUser } from "@/app/actions/settings";
import type { City } from "@/lib/db/schema";

function Field({ label, name, defaultValue, type = "text", placeholder, required }: { label: string; name: string; defaultValue?: string | number | null; type?: string; placeholder?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs text-ink-3">{label}</span>
      <input name={name} type={type} step="any" defaultValue={defaultValue ?? ""} placeholder={placeholder} required={required} className="input mt-1" />
    </label>
  );
}

export function CityForm({ city }: { city?: City }) {
  const [state, action, pending] = useActionState(saveCity, undefined);
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {city && <input type="hidden" name="id" value={city.id} />}
      <Field label="Nome città" name="name" defaultValue={city?.name} required />
      <Field label="Affiliato" name="affiliateName" defaultValue={city?.affiliateName} />
      <Field label="Referente" name="contactName" defaultValue={city?.contactName} />
      <Field label="Telefono" name="contactPhone" defaultValue={city?.contactPhone} />
      <Field label="Email" name="contactEmail" type="email" defaultValue={city?.contactEmail} />
      <Field label="% Elerent sul fatturato" name="revenueSharePct" type="number" defaultValue={city?.revenueSharePct ?? 0} required />
      <Field label="Fee per veicolo attivo / mese (€)" name="feePerVehicleMonth" type="number" defaultValue={city?.feePerVehicleMonth ?? 0} required />
      <Field label="Raggio area (km)" name="radiusKm" type="number" defaultValue={city?.radiusKm ?? 15} />
      <Field label="Centro: latitudine" name="centerLat" type="number" defaultValue={city?.centerLat} placeholder="45.4642" />
      <Field label="Centro: longitudine" name="centerLng" type="number" defaultValue={city?.centerLng} placeholder="9.1900" />
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={city?.active ?? true} className="accent-[var(--brand)]" /> Attiva
      </label>
      <div className="flex items-end gap-3">
        <button disabled={pending} className="btn-primary">{city ? "Salva" : "Aggiungi città"}</button>
        {state?.ok && <span className="text-xs text-brand">Salvato</span>}
        {state?.error && <span className="text-xs text-critical">{state.error}</span>}
      </div>
    </form>
  );
}

export function UserForm() {
  const [state, action, pending] = useActionState(saveUser, undefined);
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="Nome" name="name" required />
      <Field label="Email" name="email" type="email" required />
      <Field label="Password (min. 8)" name="password" type="password" required />
      <label className="block">
        <span className="text-xs text-ink-3">Ruolo</span>
        <select name="role" className="input mt-1" defaultValue="operatore">
          <option value="operatore">Operatore</option>
          <option value="admin">Amministratore</option>
        </select>
      </label>
      <div className="flex items-end gap-3">
        <button disabled={pending} className="btn-primary">Crea / aggiorna</button>
        {state?.ok && <span className="text-xs text-brand">Salvato</span>}
        {state?.error && <span className="text-xs text-critical">{state.error}</span>}
      </div>
    </form>
  );
}
