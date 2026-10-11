// Piano del giorno: quali task dare al dipendente, al massimo 30, dalle più importanti.
// Funzioni pure, senza database: facili da testare.
import type { Finding, Severity } from "./engine";

export const MAX_TASKS_PER_DAY = 30;

export type PlannedTask = {
  cityId: number | null;
  rule: string;
  kind: string;
  priority: 1 | 2 | 3;
  title: string;
  reason: string;
  action: string;
  alertKey?: string;
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

/** Notifica del giorno: un tema diverso per ogni giorno della settimana (0 = domenica). */
const DAILY_THEMES: { segment: string; title: string; action: string }[] = [
  { segment: "persi", title: "Notifica del giorno: riconquistare gli utenti persi", action: "Mandare agli utenti persi un'offerta di ritorno (es. sblocco gratis o sconto sulla prima corsa) e annotare il testo usato." },
  { segment: "in_calo", title: "Notifica del giorno: risvegliare gli utenti in calo", action: "Mandare agli utenti che usano meno il servizio un promemoria con un motivo per tornare (meteo, eventi, zone nuove)." },
  { segment: "abituali", title: "Notifica del giorno: abbonamenti agli utenti abituali", action: "Proporre agli abituali l'abbonamento o il pacchetto più conveniente rispetto a quanto spendono a corsa." },
  { segment: "dormienti", title: "Notifica del giorno: risvegliare gli utenti dormienti", action: "Mandare ai dormienti un invito a tornare con un vantaggio limitato nel tempo." },
  { segment: "occasionali", title: "Notifica del giorno: pacchetti agli occasionali", action: "Spingere i pacchetti di minuti o corse verso chi usa il servizio ogni tanto, per farlo diventare abituale." },
  { segment: "abituali", title: "Notifica del giorno: weekend in monopattino", action: "Mandare agli abituali una notifica per il weekend (giri in città, mare, eventi) con l'abbonamento giornaliero o il pacchetto." },
  { segment: "nuovi", title: "Notifica del giorno: prima corsa e primo pacchetto ai nuovi", action: "Accompagnare i nuovi iscritti alla prima corsa e presentare il pacchetto più adatto a chi inizia." },
];

/** Task di marketing di ogni giorno: notifica del giorno, solleciti dei debiti, spinta su abbonamenti e pacchetti. */
export function marketingTasks(day: string, ctx: { openDebts: number; openDebtAmount: number }): PlannedTask[] {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const theme = DAILY_THEMES[weekday];
  const out: PlannedTask[] = [
    {
      cityId: null,
      rule: `notifica:${theme.segment}`,
      kind: "notifica",
      priority: 1,
      title: theme.title,
      reason: "Almeno una notifica al giorno agli utenti: tiene vivo il servizio e porta corse e vendite.",
      action: `${theme.action} Aprire Notifiche, scegliere o rigenerare un testo, provarlo su di sé e poi inviarlo.`,
    },
  ];
  if (ctx.openDebts > 0) {
    out.push({
      cityId: null,
      rule: "recupero:solleciti",
      kind: "notifica",
      priority: 2,
      title: `Recupero crediti: ${ctx.openDebts} utenti con corse non pagate`,
      reason: `Debito aperto totale ${Math.round(ctx.openDebtAmount).toLocaleString("it-IT")} €.`,
      action: "Aprire Recupero crediti, inviare i solleciti in scadenza e riprovare in Atom il pagamento dei debiti più alti.",
    });
  }
  const promo = theme.segment === "abituali" ? "occasionali" : "abituali";
  out.push({
    cityId: null,
    rule: `notifica:${promo}:pacchetti`,
    kind: "notifica",
    priority: 3,
    title: `Spingere abbonamenti e pacchetti agli utenti ${promo}`,
    reason: "Gli abbonamenti alzano l'incasso per utente e lo rendono più stabile.",
    action: "Guardare in Abbonamenti quali si vendono di più e proporre quello giusto con una notifica mirata.",
  });
  return out;
}

/**
 * Ordina le task della giornata per importanza e tiene le prime `slots`.
 * Prima la priorità, poi la gravità dell'alert, poi le città che fatturano di più.
 * Quelle che restano fuori (es. le chiamate di routine) si ripropongono domani, se servono ancora.
 */
export function planDay(
  marketing: PlannedTask[],
  findings: { cityId: number; revenue: number; finding: Finding }[],
  slots: number,
): PlannedTask[] {
  const fromFindings = findings
    .slice()
    .sort(
      (a, b) =>
        a.finding.task.priority - b.finding.task.priority ||
        SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity] ||
        b.revenue - a.revenue,
    )
    .map(({ cityId, finding: f }): PlannedTask => ({
      cityId,
      rule: f.rule,
      kind: f.task.kind,
      priority: f.task.priority,
      title: f.task.title,
      reason: f.detail,
      action: f.task.action,
      alertKey: `${cityId}:${f.rule}`,
    }));
  // La notifica del giorno è sempre dentro; le altre task di marketing competono con le altre per priorità.
  const [daily, ...rest] = marketing;
  const pool = [...rest, ...fromFindings].sort((a, b) => a.priority - b.priority);
  return [...(daily ? [daily] : []), ...pool].slice(0, Math.max(0, slots));
}
