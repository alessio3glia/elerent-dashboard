import { describe, expect, it } from "vitest";
import { cityOverrides, endDateIn, interpretUpdate, noteIsCurrent } from "@/lib/dashboard-updates-rules";

const cities = [
  { id: 1, name: "Ardea" },
  { id: 2, name: "Messina" },
  { id: 3, name: "Reggio Calabria" },
];
const today = "2026-10-11";

describe("interpretUpdate", () => {
  it("riconosce una città chiusa", () => {
    expect(interpretUpdate("Ardea è una città che non abbiamo più attiva", cities, today)).toEqual({ kind: "citta_chiusa", cityId: 1, endsOn: null });
    expect(interpretUpdate("ardea non è più operativa", cities, today).kind).toBe("citta_chiusa");
  });
  it("riconosce sospensioni con data di fine", () => {
    expect(interpretUpdate("Messina sospesa fino al 15/11 per maltempo", cities, today)).toEqual({ kind: "citta_sospesa", cityId: 2, endsOn: "2026-11-15" });
    expect(interpretUpdate("Reggio Calabria in pausa invernale fino al 1 marzo", cities, today)).toEqual({ kind: "citta_sospesa", cityId: 3, endsOn: "2027-03-01" });
  });
  it("riconosce riaperture e note", () => {
    expect(interpretUpdate("Ardea di nuovo operativa da oggi", cities, today).kind).toBe("citta_riaperta");
    expect(interpretUpdate("A Messina oggi c'è la festa patronale, centro chiuso al traffico", cities, today)).toEqual({ kind: "nota", cityId: 2, endsOn: null });
    expect(interpretUpdate("Abbiamo ritirato i mezzi da Ardea", cities, today).kind).toBe("citta_chiusa");
    expect(interpretUpdate("Pioggia forte su tutta la Sicilia", cities, today)).toEqual({ kind: "nota", cityId: null, endsOn: null });
    expect(interpretUpdate("Una città non è più attiva", cities, today).kind).toBe("nota");
  });
  it("legge le date", () => {
    expect(endDateIn("fino al 3/1/2027", today)).toBe("2027-01-03");
    expect(endDateIn("fino al 20 ottobre", today)).toBe("2026-10-20");
    expect(endDateIn("niente date qui", today)).toBeNull();
  });
});

describe("cityOverrides", () => {
  const u = (cityId: number, kind: string, createdAt: string, extra: Partial<{ startsOn: string; endsOn: string | null; revokedAt: Date | null }> = {}) => ({
    cityId, kind, createdAt: new Date(createdAt), startsOn: "2026-10-01", endsOn: null, revokedAt: null, ...extra,
  });
  it("vale l'ultimo aggiornamento non annullato e già iniziato", () => {
    const map = cityOverrides(
      [
        u(1, "citta_chiusa", "2026-10-01"),
        u(2, "citta_chiusa", "2026-10-01"),
        u(2, "citta_riaperta", "2026-10-05"),
        u(3, "citta_chiusa", "2026-10-05", { revokedAt: new Date() }),
        u(3, "citta_chiusa", "2026-10-06", { startsOn: "2026-10-20" }),
      ],
      today,
    );
    expect([...map]).toEqual([[1, "chiusa"], [2, "attiva"]]);
  });
  it("una sospensione scaduta lascia la città alla regola automatica", () => {
    expect(cityOverrides([u(1, "citta_sospesa", "2026-10-01", { endsOn: "2026-10-10" })], today).size).toBe(0);
    expect(cityOverrides([u(1, "citta_sospesa", "2026-10-01", { endsOn: "2026-10-11" })], today).get(1)).toBe("chiusa");
  });
});

describe("noteIsCurrent", () => {
  it("mostra note in periodo o recenti", () => {
    const weekAgo = "2026-10-04";
    expect(noteIsCurrent({ startsOn: "2026-10-05", endsOn: null, revokedAt: null }, today, weekAgo)).toBe(true);
    expect(noteIsCurrent({ startsOn: "2026-09-01", endsOn: null, revokedAt: null }, today, weekAgo)).toBe(false);
    expect(noteIsCurrent({ startsOn: "2026-09-01", endsOn: "2026-10-30", revokedAt: null }, today, weekAgo)).toBe(true);
    expect(noteIsCurrent({ startsOn: "2026-10-12", endsOn: null, revokedAt: null }, today, weekAgo)).toBe(false);
  });
});
