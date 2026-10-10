import { describe, expect, it } from "vitest";
import { isOnStreet, parseBattery, parseDate, parseNumber } from "@/lib/atom/parse";

describe("parseNumber", () => {
  it("legge importi in formato europeo e inglese", () => {
    expect(parseNumber("3,50 €")).toBe(3.5);
    expect(parseNumber("\u200e2,50 €")).toBe(2.5); // Atom antepone un carattere invisibile
    expect(parseNumber("1.21 km")).toBe(1.21);
    expect(parseNumber("€1.234,56")).toBe(1234.56);
    expect(parseNumber("1,234.56")).toBe(1234.56);
    expect(parseNumber("12.4 km")).toBe(12.4);
    expect(parseNumber(7)).toBe(7);
  });
  it("restituisce null per valori vuoti", () => {
    expect(parseNumber("-")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(null)).toBeNull();
  });
});

describe("parseDate", () => {
  it("legge il formato Atom gg/mm/aa come ora italiana", () => {
    // Dato reale: "10/10/26 10:53:07" corrisponde a history_start_date 1791622387
    expect(parseDate("10/10/26 10:53:07")?.getTime()).toBe(1791622387 * 1000);
    expect(parseDate(1791622387)?.toISOString()).toBe("2026-10-10T08:53:07.000Z");
    // In inverno l'Italia è a UTC+1
    expect(parseDate("15/01/26 12:00")?.toISOString()).toBe("2026-01-15T11:00:00.000Z");
  });
  it("legge ISO con fuso, formato SQL e formato europeo a 4 cifre", () => {
    expect(parseDate("2026-10-08T10:15:00Z")?.toISOString()).toBe("2026-10-08T10:15:00.000Z");
    expect(parseDate("2026-10-08 10:15:00")?.toISOString()).toBe("2026-10-08T08:15:00.000Z");
    expect(parseDate("08.10.2026 10:15")?.toISOString()).toBe("2026-10-08T08:15:00.000Z");
  });
  it("restituisce null per valori non validi", () => {
    expect(parseDate("-")).toBeNull();
    expect(parseDate("boh")).toBeNull();
  });
});

describe("stato veicolo", () => {
  it("riconosce gli stati fuori strada", () => {
    expect(isOnStreet("READY")).toBe(true);
    expect(isOnStreet("in use")).toBe(true);
    for (const s of ["NOT_READY", "NEED_SERVICE", "NEED_INVESTIGATION", "CHARGING", "TRANSPORTATION", "STOLEN"]) {
      expect(isOnStreet(s)).toBe(false);
    }
    expect(isOnStreet(null)).toBe(false);
  });
  it("legge la batteria", () => {
    expect(parseBattery("45%")).toBe(45);
    expect(parseBattery(80)).toBe(80);
  });
});
