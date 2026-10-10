"use client";

import { useActionState } from "react";
import { saveRecovery, sendAllDue, sendTestEmail, type ActionState } from "@/app/actions/recovery";
import type { RecoverySettings } from "@/lib/recovery";

const STAGES = ["1 · Promemoria cortese", "2 · Sollecito", "3 · Avviso pratica legale"];

function Message({ state }: { state: ActionState }) {
  if (!state) return null;
  return <p className={`text-sm ${state.error ? "text-critical" : "text-brand"}`}>{state.error ?? state.ok}</p>;
}

export function SendDueForm({ due, ready }: { due: number; ready: boolean }) {
  const [state, action, pending] = useActionState(sendAllDue, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" name="confirm" className="mt-1 accent-[var(--brand)]" disabled={!ready || due === 0} />
        Confermo di inviare la prossima email della sequenza a {due} utenti con debito verificato nelle ultime 24 ore.
      </label>
      <button className="btn-primary self-start" disabled={!ready || due === 0 || pending}>
        {pending ? "Invio in corso…" : `Invia ${due} email`}
      </button>
      <Message state={state} />
    </form>
  );
}

export function SettingsForm({ settings, isAdmin, ready }: { settings: RecoverySettings; isAdmin: boolean; ready: boolean }) {
  const [state, action, pending] = useActionState(saveRecovery, null);
  const [testState, testAction, testing] = useActionState(sendTestEmail, null);
  return (
    <div className="grid gap-6">
      <form action={action} className="grid gap-5">
        {settings.templates.map((t, i) => (
          <fieldset key={i} className="grid gap-2" disabled={!isAdmin}>
            <legend className="mb-1 text-sm font-medium">{STAGES[i]}</legend>
            <input name={`subject${i + 1}`} defaultValue={t.subject} className="input" placeholder="Oggetto" />
            <textarea name={`body${i + 1}`} defaultValue={t.body} rows={9} className="input font-[inherit]" />
          </fieldset>
        ))}
        <p className="text-xs text-ink-3">Nei testi puoi usare {"{nome}"}, {"{importo}"} e {"{citta}"}: vengono sostituiti per ogni utente.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-sm text-ink-2">Giorni tra una email e l&apos;altra
            <input name="delayDays" type="number" min={1} max={60} defaultValue={settings.delayDays} className="input mt-1" disabled={!isAdmin} />
          </label>
          <label className="text-sm text-ink-2">Debito minimo da sollecitare (€)
            <input name="minDebt" type="number" step="0.5" min={0} defaultValue={settings.minDebt} className="input mt-1" disabled={!isAdmin} />
          </label>
          <label className="text-sm text-ink-2">Massimo email al giorno
            <input name="dailyLimit" type="number" min={1} max={1000} defaultValue={settings.dailyLimit} className="input mt-1" disabled={!isAdmin} />
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm text-ink-2">
          <input type="checkbox" name="auto" defaultChecked={settings.auto} className="mt-1 accent-[var(--brand)]" disabled={!isAdmin || !ready} />
          Invio automatico: ogni mattina parte da sola la prossima email per chi ha ancora il debito aperto.
        </label>
        {isAdmin && (
          <div className="flex items-center gap-3">
            <button className="btn-primary" disabled={pending}>{pending ? "Salvo…" : "Salva testi e regole"}</button>
            <Message state={state} />
          </div>
        )}
      </form>
      <form action={testAction} className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <span className="text-sm text-ink-2">Mandami una prova della email</span>
        {[1, 2, 3].map((s) => (
          <button key={s} name="stage" value={s} className="btn-secondary" disabled={!ready || testing}>{s}</button>
        ))}
        <Message state={testState} />
      </form>
    </div>
  );
}
