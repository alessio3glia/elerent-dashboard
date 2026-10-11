"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// Riconoscimento vocale del browser (Chrome, Edge, Safari): gratis, nessun servizio esterno da pagare.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

const ctor = (): RecognitionCtor | null =>
  typeof window === "undefined"
    ? null
    : ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition ??
      null);

const noop = () => () => {};

const ERRORS: Record<string, string> = {
  "not-allowed": "Il browser non ha il permesso di usare il microfono: consentilo dall'icona accanto all'indirizzo.",
  "service-not-allowed": "Il browser non ha il permesso di usare il microfono: consentilo dall'icona accanto all'indirizzo.",
  "audio-capture": "Nessun microfono trovato.",
  network: "Dettatura non disponibile senza connessione.",
};

/**
 * Pulsante per dettare a voce: il testo riconosciuto si aggiunge in fondo a quello già scritto.
 * Resta in ascolto anche per messaggi lunghi finché non si preme di nuovo.
 */
export function Dictation({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const supported = useSyncExternalStore(noop, () => ctor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const text = useRef(value);
  useEffect(() => {
    text.current = value;
  }, [value]);
  useEffect(() => () => { wanted.current = false; rec.current?.stop(); }, []);

  const append = (piece: string) => {
    const p = piece.trim();
    if (!p) return;
    const base = text.current.trimEnd();
    const next = base ? `${base} ${p}` : p.charAt(0).toUpperCase() + p.slice(1);
    text.current = next;
    onChange(next);
  };

  const start = () => {
    const Ctor = ctor();
    if (!Ctor) return;
    setError(null);
    const r = new Ctor();
    r.lang = "it-IT";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) append(res[0].transcript);
        else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      wanted.current = false;
      setError(ERRORS[e.error] ?? "La dettatura si è interrotta, riprova.");
    };
    // Il browser chiude l'ascolto dopo una pausa: se il dipendente non ha premuto stop, riparte da solo.
    r.onend = () => {
      setInterim("");
      if (wanted.current) {
        try { r.start(); return; } catch { /* già ripartito */ }
      }
      setListening(false);
    };
    rec.current = r;
    wanted.current = true;
    r.start();
    setListening(true);
  };

  const stop = () => {
    wanted.current = false;
    rec.current?.stop();
  };

  if (!supported) {
    return <p className="mt-1 text-xs text-ink-3">Per dettare a voce usa Chrome, Edge o Safari, oppure il microfono della tastiera del telefono.</p>;
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <button type="button" onClick={listening ? stop : start} className={listening ? "btn-primary" : "btn-secondary"} aria-pressed={listening}>
        {listening ? (
          <>
            <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-black" />
            Ferma dettatura
          </>
        ) : (
          "🎙️ Detta a voce"
        )}
      </button>
      {listening && <span className="text-xs text-ink-3">{interim ? <span className="text-ink-2">{interim}…</span> : "Ti ascolto: parla pure anche a lungo, premi Ferma quando hai finito."}</span>}
      {error && <span className="text-xs text-critical">{error}</span>}
    </div>
  );
}
