import { describe, expect, it } from "vitest";
import { isOnStreet, parseBattery, parseDate, parseNumber } from "@/lib/atom/parse";

describe("parseNumber", () => {
  it("legge importi in formato europeo e inglese", () => {
    expect(parseNumber("3,50 €")).toBe(3.5);
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
  it("legge ISO, formato SQL e formato europeo", () => {
    expect(parseDate("2026-10-08T10:15:00Z")?.toISOString()).toBe("2026-10-08T10:15:00.000Z");
    expect(parseDate("2026-10-08 10:15:00")?.toISOString()).toBe("2026-10-08T10:15:00.000Z");
    expect(parseDate("08.10.2026 10:15")?.toISOString()).toBe("2026-10-08T10:15:00.000Z");
    expect(parseDate("08/10/2026")?.toISOString()).toBe("2026-10-08T00:00:00.000Z");
  });
  it("restituisce null per valori non validi", () => {
    expect(parseDate("-")).toBeNull();
    expect(parseDate("boh")).toBeNull();
  });
});

describe("stato veicolo", () => {
  it("riconosce gli stati fuori strada", () => {
    expect(isOnStreet("AVAILABLE")).toBe(true);
    expect(isOnStreet("in use")).toBe(true);
    expect(isOnStreet("MAINTENANCE")).toBe(false);
    expect(isOnStreet("Out of order")).toBe(false);
    expect(isOnStreet(null)).toBe(false);
  });
  it("legge la batteria", () => {
    expect(parseBattery("45%")).toBe(45);
    expect(parseBattery(80)).toBe(80);
  });
});
