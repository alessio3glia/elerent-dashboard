"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { regenerateSuggestions, sendNotification } from "@/app/actions/notifications";
import { placeholders, type Suggestion } from "@/lib/notification-suggestions";

type Props = { segment: string; cityId?: number; cityName?: string; recipients: number; suggestions: Suggestion[]; enabled: boolean; aiEnabled: boolean };

export function Composer({ segment, cityId, cityName, recipients, suggestions: initial, enabled, aiEnabled }: Props) {
  const [state, action, pending] = useActionState(sendNotification, undefined);
  const [suggestions, setSuggestions] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenerating, startRegen] = useTransition();
  const regenerate = () =>
    startRegen(async () => {
      setRegenError(null);
      try {
        const res = await regenerateSuggestions({ segment, cityName, shown: seen.slice(-30) });
        setSuggestions(res.suggestions);
        setSeen((prev) => [...prev, ...res.suggestions]);
      } catch {
        setRegenError("Non sono riuscito a generare nuove idee, riprova.");
      }
    });
  // Con Claude collegato le prime proposte le scrive lui; intanto si vedono quelle del catalogo
  const asked = useRef(false);
  useEffect(() => {
    if (aiEnabled && !asked.current) {
      asked.current = true;
      regenerate();
    }
  });
  const [title, setTitle] = useState(suggestions[0]?.title ?? "");
  const [body, setBody] = useState(suggestions[0]?.body ?? "");
  const missing = placeholders(`${title} ${body}`);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs text-ink-3">Testi suggeriti: clicca per usarli, poi modificali come vuoi.</span>
          <button type="button" onClick={regenerate} disabled={regenerating} className="btn-secondary shrink-0">
            {regenerating ? "Genero…" : "🔄 Rigenera"}
          </button>
        </div>
        {regenError && <p className="mb-2 text-xs text-critical">{regenError}</p>}
        <div className={`space-y-2 transition-opacity ${regenerating ? "opacity-50" : ""}`}>
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
