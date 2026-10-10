import { describe, expect, it } from "vitest";
import { pickSuggestions, placeholders, suggestionsFor } from "@/lib/notification-suggestions";

describe("suggerimenti notifiche", () => {
  it("ha testi per ogni segmento e inserisce la città", () => {
    for (const s of ["nuovi", "abituali", "occasionali", "in_calo", "dormienti", "persi", "mai_attivi"]) {
      expect(suggestionsFor(s).length).toBeGreaterThan(0);
    }
    expect(suggestionsFor("dormienti", "Messina")[0].body).toContain("a Messina");
    expect(suggestionsFor("dormienti")[0].body).not.toContain(" a ");
  });

  it("riconosce le parti da completare", () => {
    expect(placeholders("Codice [CODICE] entro [DATA]")).toEqual(["[CODICE]", "[DATA]"]);
    expect(placeholders("Tutto pronto")).toEqual([]);
  });
});

describe("rigenera dal catalogo", () => {
  it("propone testi diversi da quelli già mostrati, sempre con emoji", () => {
    const first = suggestionsFor("dormienti").slice(0, 3);
    const next = pickSuggestions("dormienti", null, first.map((s) => s.title));
    expect(next.length).toBe(3);
    expect(next.slice(0, 2).every((s) => !first.some((f) => f.title === s.title))).toBe(true);
    for (const seg of ["nuovi", "abituali", "occasionali", "in_calo", "dormienti", "persi", "mai_attivi"]) {
      for (const s of suggestionsFor(seg)) expect(/\p{Extended_Pictographic}/u.test(s.title + s.body)).toBe(true);
    }
  });

  it("quando le idee nuove finiscono riprende anche quelle già viste", () => {
    const all = suggestionsFor("persi");
    expect(pickSuggestions("persi", null, all.map((s) => s.title)).length).toBe(3);
  });
});
