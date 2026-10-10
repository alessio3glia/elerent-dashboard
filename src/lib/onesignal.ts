import "server-only";

/** Come gli utenti Atom sono riconosciuti in OneSignal (External ID impostato dall'app). */
export type ExternalIdField = "atom_id" | "email" | "phone";

const API = "https://api.onesignal.com/notifications?c=push";
/** Limite OneSignal di External ID per singola richiesta. */
const BATCH = 20_000;

export function oneSignalConfig() {
  const appId = process.env.ONESIGNAL_APP_ID?.trim();
  const apiKey = process.env.ONESIGNAL_REST_API_KEY?.trim();
  const field = process.env.ONESIGNAL_EXTERNAL_ID?.trim();
  const testIds = (process.env.ONESIGNAL_TEST_EXTERNAL_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    configured: Boolean(appId && apiKey),
    appId,
    apiKey,
    externalIdField: (field === "email" || field === "phone" ? field : "atom_id") as ExternalIdField,
    testIds,
  };
}

type Target = { externalIds: string[] } | { test: true };
export type SendResult = { ids: string[]; errors: string[] };

async function post(body: Record<string, unknown>): Promise<{ id?: string; errors?: unknown }> {
  const cfg = oneSignalConfig();
  if (!cfg.configured) throw new Error("OneSignal non configurato: mancano ONESIGNAL_APP_ID o ONESIGNAL_REST_API_KEY");
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Key ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: cfg.appId, target_channel: "push", ...body }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; errors?: unknown };
  if (!res.ok) throw new Error(`OneSignal ${res.status}: ${JSON.stringify(json.errors ?? json).slice(0, 300)}`);
  return json;
}

function describeErrors(errors: unknown): string[] {
  if (!errors) return [];
  if (Array.isArray(errors)) return errors.map(String);
  if (typeof errors === "object") {
    const invalid = (errors as { invalid_aliases?: { external_id?: unknown[] } }).invalid_aliases?.external_id;
    if (invalid?.length) return [`${invalid.length} utenti non iscritti alle notifiche`];
    return [JSON.stringify(errors).slice(0, 200)];
  }
  return [String(errors)];
}

/** Invia una push. In prova va agli External ID di test o al segmento "Test Users" di OneSignal. */
export async function sendPush(title: string, message: string, target: Target): Promise<SendResult> {
  const content = { headings: { en: title, it: title }, contents: { en: message, it: message } };
  const cfg = oneSignalConfig();
  const batches: Record<string, unknown>[] = [];
  if ("test" in target) {
    batches.push(cfg.testIds.length ? { include_aliases: { external_id: cfg.testIds } } : { included_segments: ["Test Users"] });
  } else {
    for (let i = 0; i < target.externalIds.length; i += BATCH) {
      batches.push({ include_aliases: { external_id: target.externalIds.slice(i, i + BATCH) } });
    }
  }
  const out: SendResult = { ids: [], errors: [] };
  for (const b of batches) {
    const r = await post({ ...content, ...b });
    if (r.id) out.ids.push(r.id);
    out.errors.push(...describeErrors(r.errors));
  }
  return out;
}
