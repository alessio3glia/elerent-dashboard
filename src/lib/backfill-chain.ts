import "server-only";

/** Segreto condiviso tra i blocchi dell'import che si richiamano da soli. */
export function chainSecret() {
  return process.env.CRON_SECRET || process.env.SESSION_SECRET || "";
}

/** Chiede al server di eseguire il prossimo blocco dell'import (risponde subito, il lavoro continua in background). */
export async function triggerBackfillStep(origin: string, restart = false): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/api/backfill${restart ? "?restart=1" : ""}`, {
      method: "POST",
      headers: { "x-backfill-secret": chainSecret() },
      cache: "no-store",
    });
    if (res.ok) return null;
    console.error(`Import storico: avvio blocco successivo fallito (${res.status})`);
    return `il server ha risposto ${res.status}`;
  } catch (error) {
    console.error("Import storico: avvio blocco successivo fallito", error);
    return error instanceof Error ? error.message : "errore di rete";
  }
}
