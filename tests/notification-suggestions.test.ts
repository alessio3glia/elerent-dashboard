import { describe, expect, it } from "vitest";
import { placeholders, suggestionsFor } from "@/lib/notification-suggestions";

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
