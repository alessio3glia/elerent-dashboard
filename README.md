# Elerent Monitor

Dashboard interna Elerent costruita sopra l'API di Atom: monitora città e affiliati, segnala cali e trend negativi e genera ogni mattina le task del dipendente.

## Cosa fa

- **Panoramica**: ricavo Elerent, fatturato, corse, veicoli in strada, città ordinate dalla peggiore.
- **Task di oggi**: generate dal motore di regole con motivo e azione suggerita; il dipendente le chiude con una nota (le chiamate fatte aggiornano l'ultimo contatto con l'affiliato).
- **Alert**: calo fatturato, meno veicoli in strada, veicoli fermi da 3 giorni, batteria bassa, riposizionamento mancato, utilizzo basso rispetto alla rete, trend negativo su 3 settimane, zero corse, contatto periodico.
- **Analytics**: ogni metrica per giorno o settimana, per tutta la rete o per città, con confronto sul periodo precedente.
- **Città**: KPI, grafici, mappa della flotta, storico alert e contatti.
- **Utenti**: segmenti (nuovi, abituali, occasionali, in calo, dormienti, persi) con la notifica suggerita per aumentare la spesa.
- **Impostazioni** (admin): città, area geografica, % sul fatturato e fee per veicolo, accessi del team.

## Come funziona

1. `src/lib/atom/client.ts` legge da Atom (endpoint "Admin dashboard", sola lettura): veicoli, corse, clienti.
2. `src/lib/sync/sync.ts` salva tutto su Postgres. Veicoli e corse sono assegnati alla città più vicina il cui raggio li contiene. Ogni sync salva anche una foto della flotta (posizione, stato, batteria).
3. `src/lib/metrics/` calcola i KPI giornalieri per città (fuso Europe/Rome). Ricavo Elerent = % sul fatturato + fee mensile per veicolo in strada ripartita per giorno.
4. `src/lib/rules/engine.ts` trasforma i KPI in alert e task. Le soglie sono in `THRESHOLDS`.
5. Vercel Cron chiama `/api/cron/daily` ogni mattina (04:00 UTC): sync incrementale, KPI degli ultimi 3 giorni, task del giorno.

Atom non conserva le posizioni passate: per i giorni prima della prima sincronizzazione la flotta è stimata dai veicoli che hanno fatto corse negli ultimi 7 giorni (campo `estimated`).

## Avvio

```bash
cp .env.example .env.local   # compila le variabili
npm install
npm run db:migrate
npm run user:create -- tu@elerent.com "Nome" password-sicura admin
npm run backfill             # importa tutto lo storico da Atom (può richiedere tempo)
npm run dev
```

Per vedere la dashboard senza Atom: `npm run seed:demo` (crea 4 città "Demo").

Altri comandi: `npm run daily` (job giornaliero a mano), `npm test`, `npm run typecheck`.

## Deploy su Vercel

1. Importa la repo su Vercel e collega un database Postgres (Neon dal Marketplace, imposta DATABASE_URL).
2. Imposta le altre variabili di `.env.example`: ATOM_EMAIL, ATOM_PASSWORD, SESSION_SECRET, CRON_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD.
3. Il build applica da solo le migrazioni. Al primo accesso con ADMIN_EMAIL/ADMIN_PASSWORD viene creato l'amministratore; gli altri accessi si creano da Impostazioni.
4. Import dello storico: `npm run backfill` da una macchina con lo stesso DATABASE_URL.
5. Il cron giornaliero è già configurato in `vercel.json`.

## Da verificare con i dati reali di Atom

- Formato di date e importi nelle risposte (gestiti più formati in `src/lib/atom/parse.ts`).
- Ordine delle corse (si assume dalla più recente) e paginazione.
- Valori di `status` dei veicoli considerati "fuori strada".
- Se l'API permette di filtrare per città/operatore, sostituire l'assegnazione geografica.
