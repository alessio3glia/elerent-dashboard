"use client";

import { useActionState, useRef, useState } from "react";
import { saveDashboardUpdate } from "@/app/actions/dashboard-updates";
import { UPDATE_KINDS, interpretUpdate, type UpdateKind } from "@/lib/dashboard-updates-rules";

type City = { id: number; name: string; active: boolean };

export function UpdateForm({ cities, today }: { cities: City[]; today: string }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<UpdateKind>("nota");
  const [cityId, setCityId] = useState("");
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState("");
  // Finché il dipendente non tocca tipo, città o fine, li propone la dashboard leggendo il testo.
  const touched = useRef({ kind: false, city: false, end: false });
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof saveDashboardUpdate>> | undefined, data: FormData) => {
    const res = await saveDashboardUpdate(prev, data);
    if (res.ok) {
      touched.current = { kind: false, city: false, end: false };
      setText(""); setKind("nota"); setCityId(""); setStartsOn(today); setEndsOn("");
    }
    return res;
  }, undefined);

  const read = (value: string) => {
    setText(value);
    const guess = interpretUpdate(value, cities, today);
    if (!touched.current.kind) setKind(guess.kind);
    if (!touched.current.city && guess.cityId) setCityId(String(guess.cityId));
    if (!touched.current.end && guess.endsOn) setEndsOn(guess.endsOn);
  };


  const meta = UPDATE_KINDS[kind];
  const cityName = cities.find((c) => String(c.id) === cityId)?.name ?? "";

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs text-ink-3">Cosa è cambiato? Scrivilo come lo diresti a un collega.</span>
        <textarea
          name="text"
          value={text}
          onChange={(e) => read(e.target.value)}
          rows={3}
          className="input"
          placeholder="Es. Ardea non è più operativa, abbiamo ritirato i mezzi. Oppure: Messina sospesa fino al 15/11 per maltempo."
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-3">Tipo</span>
          <select name="kind" value={kind} onChange={(e) => { touched.current.kind = true; setKind(e.target.value as UpdateKind); }} className="input">
            {Object.entries(UPDATE_KINDS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-3">Città{meta.needsCity ? "" : " (facoltativa)"}</span>
          <select name="cityId" value={cityId} onChange={(e) => { touched.current.city = true; setCityId(e.target.value); }} className="input">
            <option value="">{meta.needsCity ? "Scegli…" : "Tutta la rete"}</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (non operativa)"}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-3">Dal</span>
          <input type="date" name="startsOn" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="input" />
        </label>
        {meta.hasEnd && (
          <label className="block">
            <span className="mb-1 block text-xs text-ink-3">Al (compreso){kind === "nota" ? ", facoltativo" : ""}</span>
            <input type="date" name="endsOn" value={endsOn} min={startsOn} onChange={(e) => { touched.current.end = true; setEndsOn(e.target.value); }} className="input" />
          </label>
        )}
      </div>
      <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">
        <span className="font-medium text-brand">Cosa succede: </span>
        {meta.needsCity && !cityName ? "scegli la città." : meta.effect(cityName)}
      </p>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending || !text.trim()}>{pending ? "Salvo…" : "Salva aggiornamento"}</button>
        {state?.error && <span className="text-sm text-critical">{state.error}</span>}
        {state?.ok && <span className="text-sm text-brand">Fatto: la dashboard è aggiornata.</span>}
      </div>
    </form>
  );
}
