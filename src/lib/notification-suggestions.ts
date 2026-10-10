/**
 * Testi di notifica suggeriti per ogni segmento utenti. Il dipendente li sceglie, li modifica e li invia:
 * le parti tra [parentesi quadre] vanno completate (es. codice sconto) e bloccano l'invio finché restano.
 */
export type Suggestion = { title: string; body: string };

type SegmentKey = "nuovi" | "abituali" | "occasionali" | "in_calo" | "dormienti" | "persi" | "mai_attivi";

const TEXTS: Record<SegmentKey, (where: string) => Suggestion[]> = {
  nuovi: (where) => [
    { title: "Benvenuto in Elerent! 🛴", body: `Com'è andata la prima corsa${where}? La seconda ti aspetta: sblocca un mezzo e muoviti in libertà.` },
    { title: "La tua seconda corsa costa meno", body: "Usa il codice [CODICE] entro [DATA] e risparmi sulla prossima corsa. Ci vediamo in strada!" },
    { title: "Lo sapevi?", body: "Puoi vedere i mezzi più vicini direttamente dalla mappa e prenotarli per qualche minuto prima di arrivare." },
  ],
  abituali: (where) => [
    { title: "Grazie per viaggiare con noi 💚", body: `Sei tra gli utenti più attivi${where}. Con un pacchetto minuti risparmi su ogni corsa.` },
    { title: "Risparmia sulle tue corse", body: "Ricarica il wallet questa settimana e ricevi [BONUS] in omaggio." },
  ],
  occasionali: (where) => [
    { title: "Il mezzo giusto è vicino a te", body: `Hai un tragitto breve oggi${where}? Sblocca un mezzo Elerent e arrivi prima, senza parcheggio.` },
    { title: "Una corsa in regalo per te", body: "Solo per questo weekend: con il codice [CODICE] la prossima corsa costa meno." },
  ],
  in_calo: (where) => [
    { title: "Ci manchi! 💚", body: `Abbiamo notato che usi meno Elerent${where}. Torna in sella con uno sconto sulla prossima corsa: codice [CODICE].` },
    { title: "Qualcosa non è andato?", body: "Se hai avuto un problema con un mezzo, rispondi dall'app: ci aiuti a migliorare il servizio." },
  ],
  dormienti: (where) => [
    { title: "È il momento di ripartire 🛴", body: `I mezzi Elerent${where} ti aspettano. Sblocco gratuito sulla prossima corsa con il codice [CODICE].` },
    { title: "Novità in città", body: `Abbiamo nuovi mezzi e nuove zone${where}. Apri l'app e scopri dove trovarli.` },
  ],
  persi: (where) => [
    { title: "Elerent è cambiata", body: `Nuovi mezzi, più zone coperte${where}. Ti regaliamo lo sblocco della prossima corsa: codice [CODICE].` },
  ],
  mai_attivi: () => [
    { title: "La tua prima corsa ti aspetta", body: "Ti sei iscritto ma non hai ancora provato Elerent: la prima corsa è in regalo con il codice [CODICE]." },
    { title: "Come funziona Elerent", body: "Trova un mezzo sulla mappa, inquadra il QR e parti. Fine corsa in pochi tap. Provalo oggi!" },
  ],
};

export function suggestionsFor(segment: string, cityName?: string | null): Suggestion[] {
  const fn = TEXTS[segment as SegmentKey];
  return fn ? fn(cityName ? ` a ${cityName}` : "") : [];
}

/** Parti tra [parentesi quadre] ancora da completare. */
export function placeholders(text: string): string[] {
  return text.match(/\[[^\]]+\]/g) ?? [];
}
