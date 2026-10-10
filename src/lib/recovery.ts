import "server-only";
import { eq, sql } from "drizzle-orm";
import type { AtomClient } from "@/lib/atom/client";
import type { SessionUser } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { saveCustomers } from "@/lib/sync/sync";

const { syncState, debtCases, recoveryEmails } = schema;

/* ---------- Impostazioni e testi della sequenza ---------- */

export type Template = { subject: string; body: string };
export type RecoverySettings = {
  templates: [Template, Template, Template];
  /** Giorni di attesa prima della email successiva. */
  delayDays: number;
  /** Sotto questa cifra non si sollecita. */
  minDebt: number;
  /** Invio automatico della sequenza ogni giorno (spento finché non lo accende una persona). */
  auto: boolean;
  /** Massimo email al giorno (il piano gratuito di Resend ne consente 100). */
  dailyLimit: number;
};

export const STAGE_LABEL = ["Nessuna email", "1 · Promemoria", "2 · Sollecito", "3 · Avviso legale"];

export const DEFAULT_SETTINGS: RecoverySettings = {
  delayDays: 7,
  minDebt: 1,
  auto: false,
  dailyLimit: 90,
  templates: [
    {
      subject: "Hai un piccolo saldo da completare su Elerent 🛴",
      body: `Ciao {nome},

ti scriviamo perché sul tuo account Elerent risulta un saldo non pagato di {importo}, relativo a una o più corse a {citta}.

Può capitare: a volte il credito non basta a coprire tutta la corsa. Per sistemare basta aprire l'app Elerent e ricaricare il credito: il saldo si chiude in automatico. 💚

Se pensi che ci sia un errore rispondi pure a questa email, verifichiamo subito.

Grazie e buone corse!
Il team Elerent`,
    },
    {
      subject: "Sollecito: saldo di {importo} ancora da pagare",
      body: `Ciao {nome},

ti abbiamo già scritto qualche giorno fa: sul tuo account Elerent risulta ancora un saldo non pagato di {importo} per corse effettuate a {citta}.

Ti chiediamo di regolarizzarlo entro 7 giorni ricaricando il credito dall'app Elerent. Finché il saldo resta aperto l'account potrebbe essere limitato e non sarà possibile avviare nuove corse.

Se hai già pagato o ritieni ci sia un errore, rispondi a questa email.

Il team Elerent`,
    },
    {
      subject: "Ultimo avviso prima di affidare la pratica al recupero crediti",
      body: `Gentile {nome},

nonostante i precedenti solleciti, sul suo account Elerent risulta ancora un debito di {importo} per corse effettuate a {citta}.

Questo è l'ultimo avviso: se il saldo non verrà regolarizzato entro 7 giorni dalla ricezione di questa email, la pratica potrà essere affidata al nostro ufficio legale o a una società di recupero crediti, con possibili costi aggiuntivi a suo carico.

Per evitarlo è sufficiente ricaricare il credito dall'app Elerent. Per qualsiasi chiarimento può rispondere a questa email.

Elerent`,
    },
  ],
};

const SETTINGS_KEY = "recovery_settings";

export async function getRecoverySettings(): Promise<RecoverySettings> {
  const [row] = await db.select().from(syncState).where(eq(syncState.key, SETTINGS_KEY));
  const saved = (row?.value ?? {}) as Partial<RecoverySettings>;
  return { ...DEFAULT_SETTINGS, ...saved, templates: (saved.templates ?? DEFAULT_SETTINGS.templates) as RecoverySettings["templates"] };
}

export async function saveRecoverySettings(value: RecoverySettings) {
  await db
    .insert(syncState)
    .values({ key: SETTINGS_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: syncState.key, set: { value, updatedAt: new Date() } });
}

/* ---------- Debiti aggiornati e pratiche ---------- */

const SCAN_KEY = "users_scan";
type ScanState = { bookmark?: string | null; pages?: number; cycleStartedAt?: string; lastCycleAt?: string | null };

/**
 * Rilegge a rotazione tutti gli utenti Atom (qualche pagina a ogni giro della sync live), così il debito di ognuno
 * è aggiornato più volte al giorno senza rifare l'import.
 */
export async function scanUsers(client: AtomClient, deadline: number) {
  const [row] = await db.select().from(syncState).where(eq(syncState.key, SCAN_KEY));
  const state: ScanState = (row?.value as ScanState) ?? {};
  let bookmark = state.bookmark ?? null;
  state.cycleStartedAt ??= new Date().toISOString();
  let pages = 0;
  while (Date.now() < deadline) {
    const page = await client.customersPage(bookmark);
    await saveCustomers(page.customers);
    pages++;
    if (!page.next || page.next === bookmark) {
      // Giro completo: si riparte dall'inizio.
      state.lastCycleAt = new Date().toISOString();
      state.cycleStartedAt = state.lastCycleAt;
      bookmark = null;
      break;
    }
    bookmark = page.next;
  }
  state.bookmark = bookmark;
  state.pages = (state.pages ?? 0) + pages;
  await db
    .insert(syncState)
    .values({ key: SCAN_KEY, value: state, updatedAt: new Date() })
    .onConflictDoUpdate({ target: syncState.key, set: { value: state, updatedAt: new Date() } });
  return pages;
}

export async function getScanState(): Promise<ScanState> {
  const [row] = await db.select().from(syncState).where(eq(syncState.key, SCAN_KEY));
  return (row?.value as ScanState) ?? {};
}

/**
 * Allinea le pratiche ai debiti di Atom: apre una pratica per chi ha un debito, aggiorna l'importo,
 * chiude come recuperata quella di chi è tornato a zero.
 */
export async function syncDebtCases() {
  await db.execute(sql`
    insert into debt_cases (customer_atom_id, initial_debt, max_debt, current_debt)
    select c.atom_id, c.debt, c.debt, c.debt from customers c
    where c.debt > 0 and not exists (select 1 from debt_cases d where d.customer_atom_id = c.atom_id and d.status in ('aperta', 'esclusa'))`);
  await db.execute(sql`
    update debt_cases d set current_debt = c.debt, max_debt = greatest(d.max_debt, c.debt)
    from customers c
    where c.atom_id = d.customer_atom_id and d.status in ('aperta', 'esclusa') and c.debt > 0 and c.debt <> d.current_debt`);
  const recovered = await db.execute<{ id: number }>(sql`
    update debt_cases d set status = 'recuperata', closed_at = now(), recovered_amount = d.max_debt, current_debt = 0
    from customers c
    where c.atom_id = d.customer_atom_id and d.status in ('aperta', 'esclusa') and coalesce(c.debt, 0) <= 0
    returning d.id`);
  return { recovered: recovered.length };
}

/* ---------- Email ---------- */

export function emailConfig() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RECOVERY_FROM_EMAIL;
  return { ready: !!key && !!from, key, from, replyTo: process.env.RECOVERY_REPLY_TO || undefined };
}

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export function fillTemplate(t: Template, data: { nome: string | null; importo: number; citta: string | null }) {
  const fill = (s: string) =>
    s
      .replaceAll("{nome}", data.nome?.split(" ")[0] || "utente")
      .replaceAll("{importo}", eur(data.importo))
      .replaceAll("{citta}", data.citta || "la tua città");
  return { subject: fill(t.subject), body: fill(t.body) };
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Invia una email con Resend. */
export async function sendEmail(to: string, subject: string, body: string) {
  const cfg = emailConfig();
  if (!cfg.ready) throw new Error("Email non configurate: mancano RESEND_API_KEY o RECOVERY_FROM_EMAIL su Vercel");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">${escapeHtml(body)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: cfg.from, to: [to], subject, text: body, html, ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) throw new Error(`Resend ${res.status}: ${json.message ?? "errore"}`);
  return json.id ?? null;
}

type CaseRow = {
  id: number;
  customer_atom_id: number;
  stage: number;
  status: string;
  current_debt: number;
  last_email_at: Date | null;
  name: string | null;
  email: string | null;
  debt: number | null;
  updated_at: Date | null;
  city: string | null;
};

const caseQuery = (where: ReturnType<typeof sql>) => sql`
  select d.id, d.customer_atom_id, d.stage, d.status, d.current_debt, d.last_email_at,
         c.name, c.email, c.debt, c.updated_at,
         (select ci.name from rides r join cities ci on ci.id = r.city_id
          where r.customer_atom_id = d.customer_atom_id order by r.start_time desc limit 1) as city
  from debt_cases d join customers c on c.atom_id = d.customer_atom_id
  where ${where}`;

/** Quante email sono partite oggi (per il limite giornaliero). */
async function sentToday() {
  const [row] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from recovery_emails
    where status = 'inviata' and sent_at >= date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome'`);
  return row?.n ?? 0;
}

/**
 * Manda la prossima email della sequenza a una pratica, solo dopo aver ricontrollato che il debito
 * sia ancora aperto, aggiornato nelle ultime 24 ore e sopra la soglia.
 */
async function sendNext(c: CaseRow, settings: RecoverySettings, sender: string) {
  if (c.status !== "aperta") return { skipped: "pratica non aperta" };
  if (c.stage >= 3) return { skipped: "sequenza finita" };
  if (!c.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return { skipped: "email mancante" };
  if (!c.debt || c.debt < settings.minDebt) return { skipped: "debito sotto soglia o già pagato" };
  if (!c.updated_at || Date.now() - new Date(c.updated_at).getTime() > 24 * 3_600_000) return { skipped: "debito non verificato nelle ultime 24 ore" };
  const stage = c.stage + 1;
  const { subject, body } = fillTemplate(settings.templates[stage - 1], { nome: c.name, importo: c.debt, citta: c.city });
  try {
    const providerId = await sendEmail(c.email, subject, body);
    await db.insert(recoveryEmails).values({ caseId: c.id, customerAtomId: c.customer_atom_id, stage, email: c.email, subject, debt: c.debt, status: "inviata", providerId, sentBy: sender });
    await db.update(debtCases).set({ stage, lastEmailAt: new Date() }).where(eq(debtCases.id, c.id));
    return { sent: stage };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.insert(recoveryEmails).values({ caseId: c.id, customerAtomId: c.customer_atom_id, stage, email: c.email, subject, debt: c.debt, status: "errore", error: message.slice(0, 300), sentBy: sender });
    return { error: message };
  }
}

/** Invio a una sola pratica (pulsante nella tabella). */
export async function sendNextForCase(caseId: number, user: SessionUser) {
  const settings = await getRecoverySettings();
  if ((await sentToday()) >= settings.dailyLimit) return { error: `Limite di ${settings.dailyLimit} email al giorno raggiunto` };
  const [c] = await db.execute<CaseRow>(caseQuery(sql`d.id = ${caseId}`));
  if (!c) return { error: "Pratica non trovata" };
  return sendNext(c, settings, user.name);
}

/** Pratiche pronte per la prossima email: debito aperto e attesa trascorsa dall'ultima. */
export async function dueCases(settings: RecoverySettings, limit: number) {
  return db.execute<CaseRow>(
    sql`${caseQuery(sql`d.status = 'aperta' and d.stage < 3 and c.debt >= ${settings.minDebt}
      and c.email is not null and c.updated_at >= now() - interval '24 hours'
      and (d.last_email_at is null or d.last_email_at <= now() - make_interval(days => ${settings.delayDays}::int))`)}
      order by c.debt desc limit ${limit}`,
  );
}

/** Invia la prossima email a tutte le pratiche pronte (pulsante o modalità automatica), entro il limite del giorno. */
export async function sendDue(sender: string) {
  const settings = await getRecoverySettings();
  const room = settings.dailyLimit - (await sentToday());
  if (room <= 0) return { sent: 0, skipped: 0, errors: 0, limit: true };
  const cases = await dueCases(settings, room);
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  for (const c of cases) {
    const r = await sendNext(c, settings, sender);
    if ("sent" in r) sent++;
    else if ("error" in r) errors++;
    else skipped++;
  }
  return { sent, skipped, errors, limit: cases.length >= room };
}

/* ---------- Dati per la pagina ---------- */

export async function recoverySummary() {
  const [row] = await db.execute<{
    open_n: number; open_debt: number; never_emailed: number; due_soon: number;
    rec_month_n: number; rec_month: number; rec_90: number; opened_90: number; emails_month: number;
  }>(sql`
    select
      (select count(*) from debt_cases where status = 'aperta')::int as open_n,
      (select coalesce(sum(current_debt), 0) from debt_cases where status = 'aperta')::float as open_debt,
      (select count(*) from debt_cases where status = 'aperta' and stage = 0)::int as never_emailed,
      0 as due_soon,
      (select count(*) from debt_cases where status = 'recuperata' and closed_at >= date_trunc('month', now()))::int as rec_month_n,
      (select coalesce(sum(recovered_amount), 0) from debt_cases where status = 'recuperata' and closed_at >= date_trunc('month', now()))::float as rec_month,
      (select coalesce(sum(recovered_amount), 0) from debt_cases where status = 'recuperata' and opened_at >= now() - interval '90 days')::float as rec_90,
      (select coalesce(sum(max_debt), 0) from debt_cases where opened_at >= now() - interval '90 days')::float as opened_90,
      (select count(*) from recovery_emails where status = 'inviata' and sent_at >= date_trunc('month', now()))::int as emails_month`);
  return row;
}

/** Recuperato per fase: quanto si chiude senza email, dopo la prima, la seconda o la terza. */
export async function recoveredByStage() {
  return db.execute<{ stage: number; n: number; amount: number }>(sql`
    select stage, count(*)::int as n, coalesce(sum(recovered_amount), 0)::float as amount
    from debt_cases where status = 'recuperata' group by stage order by stage`);
}

export async function openCases(limit = 200, stage?: number) {
  return db.execute<CaseRow & { opened_at: Date; phone: string | null }>(sql`
    select d.id, d.customer_atom_id, d.stage, d.status, d.current_debt, d.last_email_at, d.opened_at,
           c.name, c.email, c.phone, c.debt, c.updated_at,
           (select ci.name from rides r join cities ci on ci.id = r.city_id
            where r.customer_atom_id = d.customer_atom_id order by r.start_time desc limit 1) as city
    from debt_cases d join customers c on c.atom_id = d.customer_atom_id
    where d.status = 'aperta' ${stage === undefined ? sql`` : sql`and d.stage = ${stage}`}
    order by d.current_debt desc
    limit ${limit}`);
}

export async function recentRecovered(limit = 20) {
  return db.execute<{ id: number; name: string | null; recovered_amount: number; closed_at: Date; stage: number }>(sql`
    select d.id, c.name, d.recovered_amount, d.closed_at, d.stage
    from debt_cases d left join customers c on c.atom_id = d.customer_atom_id
    where d.status = 'recuperata' order by d.closed_at desc limit ${limit}`);
}

export async function recentEmails(limit = 30) {
  return db.execute<{ id: number; email: string; subject: string; stage: number; status: string; error: string | null; sent_by: string; sent_at: Date; debt: number }>(sql`
    select id, email, subject, stage, status, error, sent_by, sent_at, debt from recovery_emails order by sent_at desc limit ${limit}`);
}
