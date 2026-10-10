import "server-only";
import { getBackfillStatus, isLocked } from "@/lib/sync/sync";

export const BACKFILL_LOCK = "backfill_lock";
/** Dopo tanti blocchi falliti di fila l'import si ferma e aspetta che qualcuno lo riavvii. */
export const MAX_CONSECUTIVE_ERRORS = 8;

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
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) return null;
    console.error(`Import storico: avvio blocco successivo fallito (${res.status})`);
    return `il server ha risposto ${res.status}`;
  } catch (error) {
    console.error("Import storico: avvio blocco successivo fallito", error);
    return error instanceof Error ? error.message : "errore di rete";
  }
}

/**
 * Se l'import non è finito ma nessun blocco sta girando da qualche minuto (es. una funzione interrotta),
 * lo fa ripartire. Chiamato in background quando qualcuno apre la dashboard e dal cron.
 */
export async function resumeBackfillIfStalled(origin: string) {
  const status = await getBackfillStatus();
  if (!status || status.state.done) return false;
  if ((status.state.errors ?? 0) >= MAX_CONSECUTIVE_ERRORS) return false;
  if (Date.now() - status.updatedAt.getTime() < 3 * 60_000) return false;
  if (await isLocked(BACKFILL_LOCK)) return false;
  console.log("Import storico fermo: lo faccio ripartire");
  await triggerBackfillStep(origin);
  return true;
}
