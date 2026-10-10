"use client";

import { useActionState, useState } from "react";
import { sendNotification } from "@/app/actions/notifications";
import { placeholders, type Suggestion } from "@/lib/notification-suggestions";

type Props = { segment: string; cityId?: number; recipients: number; suggestions: Suggestion[]; enabled: boolean };

export function Composer({ segment, cityId, recipients, suggestions, enabled }: Props) {
  const [state, action, pending] = useActionState(sendNotification, undefined);
  const [title, setTitle] = useState(suggestions[0]?.title ?? "");
  const [body, setBody] = useState(suggestions[0]?.body ?? "");
  const missing = placeholders(`${title} ${body}`);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <div className="mb-2 text-xs text-ink-3">Testi suggeriti: clicca per usarli, poi modificali.</div>
        <div className="space-y-2">
          {suggestions.map((s) => (
            <button
              key={s.title}
              type="button"
              onClick={() => { setTitle(s.title); setBody(s.body); }}
              className={`block w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${s.title === title ? "border-brand" : "border-line hover:border-ink-3"}`}
            >
              <div className="font-medium">{s.title}</div>
              <div className="mt-1 text-ink-2">{s.body}</div>
            </button>
          ))}
        </div>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="segment" value={segment} />
        {cityId && <input type="hidden" name="cityId" value={cityId} />}
        <input type="hidden" name="expected" value={recipients} />
        <label className="block">
          <span className="text-xs text-ink-3">Titolo ({title.length}/65)</span>
          <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={65} required className="input mt-1" />
        </label>
        <label className="block">
          <span className="text-xs text-ink-3">Testo ({body.length}/240)</span>
          <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={240} rows={4} required className="input mt-1" />
        </label>
        {missing.length > 0 && (
          <p className="text-xs text-warning">Da completare prima dell&apos;invio: {missing.join(", ")}</p>
        )}

        <div className="rounded-lg bg-surface-2 p-4 text-sm">
          <div className="text-xs text-ink-3">Anteprima</div>
          <div className="mt-1 font-medium">{title || "Titolo"}</div>
          <div className="text-ink-2">{body || "Testo della notifica"}</div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button name="mode" value="prova" disabled={!enabled || pending} className="btn-secondary">Invia prova</button>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirm" className="mt-1 accent-[var(--brand)]" />
          <span>Ho controllato il testo e approvo l&apos;invio a <b>{recipients.toLocaleString("it-IT")}</b> utenti.</span>
        </label>
        <button name="mode" value="invio" disabled={!enabled || pending || recipients === 0} className="btn-primary">
          {pending ? "Invio in corso…" : `Invia a ${recipients.toLocaleString("it-IT")} utenti`}
        </button>
        {state?.ok && <p className="text-sm text-brand">{state.ok}</p>}
        {state?.error && <p className="text-sm text-critical">{state.error}</p>}
      </form>
    </div>
  );
}
