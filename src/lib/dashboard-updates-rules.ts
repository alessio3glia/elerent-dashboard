/** Regole degli aggiornamenti dashboard, senza database: lettura del testo ed effetto sulle città. */

export type UpdateKind = "richiesta" | "citta_chiusa" | "citta_sospesa" | "citta_riaperta" | "nota";

export const UPDATE_KINDS: Record<UpdateKind, { label: string; needsCity: boolean; hasEnd: boolean; effect: (city: string) => string }> = {
  richiesta: {
    label: "Richiesta di modifica a Claude",
    needsCity: false,
    hasEnd: false,
    effect: () => "Claude la legge al prossimo giro, sistema la dashboard e ti risponde qui sotto con cosa ha fatto o cosa gli serve sapere.",
  },
  citta_chiusa: {
    label: "Città non più operativa",
    needsCity: true,
    hasEnd: false,
    effect: (c) => `${c} esce da home, semaforo, task e alert. I dati storici restano in Analytics e Ricavi.`,
  },
  citta_sospesa: {
    label: "Città sospesa per un periodo",
    needsCity: true,
    hasEnd: true,
    effect: (c) => `${c} esce dalle viste operative fino alla data di fine, poi torna da sola.`,
  },
  citta_riaperta: {
    label: "Città di nuovo operativa",
    needsCity: true,
    hasEnd: false,
    effect: (c) => `${c} torna in home, semaforo, task e alert anche se non ha ancora corse.`,
  },
  nota: {
    label: "Nota operativa",
    needsCity: false,
    hasEnd: true,
    effect: (c) => `La nota compare in home${c ? ` e nel semaforo di ${c}` : ""} per tutto il periodo, così chi legge i numeri sa cosa è successo.`,
  },
};

export const isUpdateKind = (v: unknown): v is UpdateKind => typeof v === "string" && v in UPDATE_KINDS;

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** "fino al 15/11", "fino al 15 novembre", "al 3/1/2027": la prima data di fine dopo oggi. */
export function endDateIn(text: string, today: string): string | null {
  const t = plain(text);
  const [y] = today.split("-").map(Number);
  const pick = (d: number, m: number, year?: number) => {
    if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12)) return null;
    let yy = year ? (year < 100 ? 2000 + year : year) : y;
    let iso = `${yy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!year && iso < today) iso = `${++yy}-${iso.slice(5)}`;
    return iso;
  };
  const num = t.match(/(?:fino a(?:l|llo)?|al|entro (?:il)?)\s*(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/);
  if (num) return pick(Number(num[1]), Number(num[2]), num[3] ? Number(num[3]) : undefined);
  const word = t.match(new RegExp(`(?:fino a(?:l|llo)?|al|entro (?:il)?)\\s*(\\d{1,2})\\s+(${MONTHS.join("|")})(?:\\s+(\\d{4}))?`));
  if (word) return pick(Number(word[1]), MONTHS.indexOf(word[2]) + 1, word[3] ? Number(word[3]) : undefined);
  return null;
}

/**
 * Prima lettura del testo scritto dal dipendente: tipo di aggiornamento, città e data di fine.
 * È solo una proposta: il dipendente la vede e la corregge prima di salvare.
 */
export function interpretUpdate(text: string, cities: { id: number; name: string }[], today: string) {
  const t = plain(text);
  const city = [...cities]
    .sort((a, b) => b.name.length - a.name.length)
    .find((c) => new RegExp(`(^|[^a-z])${plain(c.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(t));
  const endsOn = endDateIn(text, today);
  let kind: UpdateKind = "nota";
  if (/riapert|riattiv|ripart|di nuovo (attiv|operativ)|torna(ta|to)? (attiv|operativ)/.test(t)) kind = "citta_riaperta";
  else if (/sospes|temporane|in pausa|stagional|fino a(l|llo)? /.test(t) && /citta|attiv|operativ|servizio|sospes|pausa|stagional/.test(t)) kind = "citta_sospesa";
  else if (/(non|piu) (e |sono |la |lo )?(piu )?(attiv|operativ)|non (la |lo )?(gestiamo|abbiamo|seguiamo) piu|citta chiusa|chiusa (definitivamente|per sempre)|abbiamo chiuso|dismess|disattiv|ritirat[oi] (tutti )?i mezzi|abbandonat/.test(t)) kind = "citta_chiusa";
  if (kind !== "nota" && !city) kind = "nota";
  // Non è un fatto da annotare ma qualcosa da cambiare nella dashboard: la prende in carico Claude.
  if (kind === "nota" && /\b(aggiung|togli|rimuov|sposta|cambia|metti|mostra|vorrei|voglio|correggi|sistema|sbagliat|non funzion|non si vede|non vedo|rendi|crea|dovresti|bisogna|serve un|manca)/.test(t)) kind = "richiesta";
  return { kind, cityId: city?.id ?? null, endsOn: UPDATE_KINDS[kind].hasEnd ? endsOn : null };
}

export type CityUpdate = { cityId: number | null; kind: string; startsOn: string; endsOn: string | null; createdAt: Date; revokedAt: Date | null };

/**
 * Stato deciso dai dipendenti per ogni città: vale l'ultimo aggiornamento già iniziato e non annullato.
 * Una sospensione scaduta non decide più nulla: la città torna alla regola automatica.
 */
export function cityOverrides(updates: CityUpdate[], today: string): Map<number, "chiusa" | "attiva"> {
  const latest = new Map<number, CityUpdate>();
  for (const u of updates) {
    if (u.cityId === null || u.revokedAt || u.kind === "nota" || u.startsOn > today) continue;
    const prev = latest.get(u.cityId);
    if (!prev || +u.createdAt > +prev.createdAt) latest.set(u.cityId, u);
  }
  const out = new Map<number, "chiusa" | "attiva">();
  for (const [cityId, u] of latest) {
    if (u.kind === "citta_chiusa") out.set(cityId, "chiusa");
    else if (u.kind === "citta_riaperta") out.set(cityId, "attiva");
    else if (u.kind === "citta_sospesa" && (!u.endsOn || u.endsOn >= today)) out.set(cityId, "chiusa");
  }
  return out;
}

/** Note da mostrare oggi: quelle con periodo in corso, o senza fine scritte negli ultimi 7 giorni. */
export function noteIsCurrent(u: { startsOn: string; endsOn: string | null; revokedAt: Date | null }, today: string, weekAgo: string) {
  if (u.revokedAt || u.startsOn > today) return false;
  return u.endsOn ? u.endsOn >= today : u.startsOn >= weekAgo;
}
