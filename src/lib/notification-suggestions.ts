/**
 * Testi di notifica suggeriti per ogni segmento utenti. Il dipendente li sceglie, li modifica e li invia:
 * le parti tra [parentesi quadre] vanno completate (es. codice sconto) e bloccano l'invio finché restano.
 * "Rigenera" pesca altre idee da qui, oppure le chiede a Claude se è configurata ANTHROPIC_API_KEY.
 */
export type Suggestion = { title: string; body: string };

type SegmentKey = "nuovi" | "abituali" | "occasionali" | "in_calo" | "dormienti" | "persi" | "mai_attivi";

const TEXTS: Record<SegmentKey, (where: string) => Suggestion[]> = {
  nuovi: (where) => [
    { title: "Benvenuto in Elerent! 🛴", body: `Com'è andata la prima corsa${where}? 😊 La seconda ti aspetta: sblocca un mezzo e muoviti in libertà.` },
    { title: "La tua seconda corsa costa meno 🎁", body: "Usa il codice [CODICE] entro [DATA] e risparmi sulla prossima corsa. Ci vediamo in strada! 🛴" },
    { title: "Lo sapevi? 💡", body: "Puoi vedere i mezzi più vicini direttamente dalla mappa e prenotarli prima di arrivare. 📍" },
    { title: "Hai preso il ritmo? ⚡", body: `Casa, lavoro, aperitivo${where}: con Elerent arrivi ovunque in pochi minuti. Apri l'app e parti! 🚀` },
    { title: "Benvenuto a bordo 💚", body: "Parcheggia bene, fai la foto di fine corsa e sei a posto. Facile, no? 📸" },
    { title: "Il traffico? Non ti riguarda più 😎", body: `Salta la coda${where} e arriva prima. Il tuo prossimo mezzo è a pochi passi. 🛴` },
  ],
  abituali: (where) => [
    { title: "Grazie per viaggiare con noi 💚", body: `Sei tra gli utenti più attivi${where} 🏆 Con un pacchetto minuti risparmi su ogni corsa.` },
    { title: "Risparmia sulle tue corse 💸", body: "Ricarica il wallet questa settimana e ricevi [BONUS] in omaggio. 🎁" },
    { title: "Sei un vero rider 🏆", body: "Hai fatto tante corse nell'ultimo mese! Con un abbonamento paghi meno e corri di più. 🛴" },
    { title: "Un regalo per te 🎉", body: "Ai nostri rider più fedeli: codice [CODICE] per minuti gratis sulla prossima corsa. 💚" },
    { title: "Porta un amico 👯", body: `Invita un amico a provare Elerent${where}: più siamo, più mezzi mettiamo in strada. 🛴` },
  ],
  occasionali: (where) => [
    { title: "Il mezzo giusto è vicino a te 📍", body: `Hai un tragitto breve oggi${where}? Sblocca un mezzo Elerent e arrivi prima, senza parcheggio. 🛴` },
    { title: "Una corsa in regalo per te 🎁", body: "Solo per questo weekend: con il codice [CODICE] la prossima corsa costa meno. 😉" },
    { title: "Giornata perfetta per una corsa ☀️", body: `Il sole c'è, il mezzo pure${where}. Cosa aspetti? 🛴` },
    { title: "In ritardo? Ci pensiamo noi ⏱️", body: "Un mezzo Elerent è a due passi: sblocca e arrivi in tempo. 🚀" },
    { title: "Weekend in movimento 🎶", body: `Esci stasera${where}? Vai e torna in libertà con Elerent. 🌙` },
  ],
  in_calo: (where) => [
    { title: "Ci manchi! 💚", body: `Abbiamo notato che usi meno Elerent${where} 😢 Torna in sella con uno sconto: codice [CODICE].` },
    { title: "Qualcosa non è andato? 🤔", body: "Se hai avuto un problema con un mezzo, scrivici dall'app: ci aiuti a migliorare il servizio. 🙏" },
    { title: "Torniamo a correre insieme? 🛴", body: `I mezzi${where} sono carichi e pronti per te ⚡ La prossima corsa è più conveniente con [CODICE].` },
    { title: "Un piccolo regalo per te 🎁", body: "Perché ci teniamo: minuti gratis sulla prossima corsa con il codice [CODICE]. 💚" },
    { title: "Novità che ti piaceranno ✨", body: `Abbiamo aggiunto mezzi nelle zone più richieste${where}. Dai un'occhiata alla mappa! 📍` },
  ],
  dormienti: (where) => [
    { title: "È il momento di ripartire 🛴", body: `I mezzi Elerent${where} ti aspettano 💚 Sblocco gratuito sulla prossima corsa con il codice [CODICE].` },
    { title: "Novità in città ✨", body: `Abbiamo nuovi mezzi e nuove zone${where}. Apri l'app e scopri dove trovarli! 📍` },
    { title: "Ti ricordi di noi? 😊", body: "È passato un po' dall'ultima corsa. Torna a muoverti libero, ti aspettiamo! 🛴" },
    { title: "Riparti con un regalo 🎁", body: "Solo per te: la prossima corsa costa meno con il codice [CODICE]. Valido fino al [DATA]. ⏳" },
    { title: "Muoversi è più facile ⚡", body: `Niente parcheggio, niente traffico${where}. Sblocca un mezzo e vai! 🚀` },
  ],
  persi: (where) => [
    { title: "Elerent è cambiata ✨", body: `Nuovi mezzi, più zone coperte${where} 🛴 Ti regaliamo lo sblocco della prossima corsa: codice [CODICE].` },
    { title: "Ci sei mancato 💚", body: "Torna a provare Elerent: mezzi nuovi, app più veloce e tante zone in più. 🚀" },
    { title: "Dai un'altra occhiata 👀", body: `Sono cambiate tante cose${where}. Apri l'app e scopri i mezzi vicino a te. 📍` },
    { title: "Un benvenuto di nuovo 🎉", body: "Per il tuo ritorno: minuti gratis con il codice [CODICE]. Ti aspettiamo in strada! 🛴" },
  ],
  mai_attivi: () => [
    { title: "La tua prima corsa ti aspetta 🛴", body: "Ti sei iscritto ma non hai ancora provato Elerent 😊 La prima corsa è in regalo con il codice [CODICE]. 🎁" },
    { title: "Come funziona Elerent 💡", body: "Trova un mezzo sulla mappa 📍 inquadra il QR e parti. Fine corsa in pochi tap. Provalo oggi! 🚀" },
    { title: "Pronto a partire? ⚡", body: "Il tuo account è attivo: manca solo la prima corsa. Ci vogliono 30 secondi! ⏱️" },
    { title: "Prima corsa, zero pensieri 😎", body: "Niente parcheggio, niente traffico. Sblocca il tuo primo mezzo Elerent e scopri quanto è facile. 🛴" },
  ],
};

export function suggestionsFor(segment: string, cityName?: string | null): Suggestion[] {
  const fn = TEXTS[segment as SegmentKey];
  return fn ? fn(cityName ? ` a ${cityName}` : "") : [];
}

/** Altre idee dal catalogo, diverse da quelle già mostrate quando possibile. */
export function pickSuggestions(segment: string, cityName: string | null | undefined, exclude: string[], n = 3, rand = Math.random): Suggestion[] {
  const all = suggestionsFor(segment, cityName);
  const shuffle = (list: Suggestion[]) => list.map((s) => ({ s, k: rand() })).sort((a, b) => a.k - b.k).map((x) => x.s);
  // Prima le idee mai mostrate, poi (se non bastano) quelle già viste
  return [...shuffle(all.filter((s) => !exclude.includes(s.title))), ...shuffle(all.filter((s) => exclude.includes(s.title)))].slice(0, n);
}

/** Parti tra [parentesi quadre] ancora da completare. */
export function placeholders(text: string): string[] {
  return text.match(/\[[^\]]+\]/g) ?? [];
}
