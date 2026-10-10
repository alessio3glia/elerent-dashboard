import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import type { Suggestion } from "@/lib/notification-suggestions";

const Output = z.object({
  suggestions: z.array(z.object({ title: z.string(), body: z.string() })),
});

/** Nuove idee di testo scritte da Claude. Restituisce null se la chiave non c'è o la richiesta fallisce. */
export async function aiSuggestions(opts: {
  segmentLabel: string;
  segmentDescription: string;
  goal: string;
  cityName?: string | null;
  avoid: Suggestion[];
  /** Notifiche che il team ha scelto, eventualmente ritoccato, e inviato: lo stile da seguire. */
  liked: Suggestion[];
}): Promise<Suggestion[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  try {
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(Output) },
      system:
        "Scrivi notifiche push in italiano per Elerent, servizio di monopattini e bici elettriche in sharing. " +
        "Tono amichevole e diretto, dai del tu. Ogni notifica ha un titolo di massimo 50 caratteri e un testo di massimo 160 caratteri, " +
        "con 1-3 emoji ben scelte. Non inventare sconti, prezzi o date: se servono scrivi [CODICE], [BONUS] o [DATA] tra parentesi quadre, " +
        "che il dipendente completerà prima dell'invio.",
      messages: [
        {
          role: "user",
          content:
            `Gruppo di utenti: ${opts.segmentLabel} (${opts.segmentDescription}).\n` +
            `Obiettivo della comunicazione: ${opts.goal}\n` +
            (opts.cityName ? `Città: ${opts.cityName}.\n` : "Tutte le città: non nominare una città.\n") +
            (opts.liked.length
              ? `Queste sono notifiche che il team ha scelto e inviato davvero: imitane tono, lunghezza e uso delle emoji, senza copiarle.\n` +
                opts.liked.map((s) => `- ${s.title} / ${s.body}`).join("\n") + "\n"
              : "") +
            `Scrivi 3 notifiche diverse tra loro e diverse da queste già proposte:\n` +
            opts.avoid.map((s) => `- ${s.title} / ${s.body}`).join("\n"),
        },
      ],
    });
    const out = response.parsed_output?.suggestions
      ?.map((s) => ({ title: s.title.trim().slice(0, 65), body: s.body.trim().slice(0, 240) }))
      .filter((s) => s.title && s.body);
    return out?.length ? out.slice(0, 3) : null;
  } catch (e) {
    console.error("Suggerimenti Claude non disponibili:", e instanceof Error ? e.message : e);
    return null;
  }
}
