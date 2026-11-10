import { describe, expect, it } from "vitest";
import { groupByMonth, monthValue, monthsBetween, sameMonthLastYear, totalsByMonth, yoy } from "@/lib/metrics/monthly";

describe("confronto mensile", () => {
  it("trova lo stesso mese dell'anno prima", () => {
    expect(sameMonthLastYear("2026-10")).toBe("2025-10");
    expect(sameMonthLastYear("2026-01")).toBe("2025-01");
  });

  it("elenca i mesi dal più recente, anche a cavallo d'anno", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
  });

  it("somma le città e stima il ricavo Elerent con % e fee per veicolo attivo", () => {
    const cities = [
      { id: 1, revenueSharePct: 10, feePerVehicleMonth: 15 },
      { id: 2, revenueSharePct: 10, feePerVehicleMonth: 15 },
    ];
    const t = totalsByMonth(
      [
        { cityId: 1, month: "2026-10", vehicles: 80, rides: 1000, revenue: 3000, customers: 500 },
        { cityId: 2, month: "2026-10", vehicles: 20, rides: 200, revenue: 600, customers: 90 },
        { cityId: 3, month: "2026-10", vehicles: 99, rides: 9, revenue: 9, customers: 9 },
      ],
      cities,
    ).get("2026-10")!;
    expect(t.vehicles).toBe(100);
    expect(t.rides).toBe(1200);
    expect(t.elerentRevenue).toBeCloseTo(360 + 1500);
  });
});

describe("tutte le metriche mese per mese", () => {
  const row = (day: string, rides: number, estimated = false, idle = 0) => ({ day, estimated, rides, idleVehicles: idle });
  const rides = { total: (r: { rides: number }[]) => r.reduce((a, x) => a + x.rides, 0) };
  const idle = { snapshotOnly: true, total: (r: { idleVehicles: number }[]) => r.reduce((a, x) => a + x.idleVehicles, 0) / r.length };

  it("raggruppa per mese e taglia il mese in corso agli stessi giorni", () => {
    const m = groupByMonth([row("2025-11-01", 10), row("2025-11-09", 5), row("2025-11-20", 100), row("2025-12-01", 7)]);
    expect([...m.keys()]).toEqual(["2025-11", "2025-12"]);
    expect(monthValue(rides, m.get("2025-11"))).toBe(115);
    expect(monthValue(rides, m.get("2025-11"), 9)).toBe(15);
    expect(monthValue(rides, m.get("2024-11"))).toBeNull();
  });

  it("le metriche della foto del mattino non esistono nei giorni stimati", () => {
    expect(monthValue(idle, [row("2025-11-01", 1, true, 0)])).toBeNull();
    expect(monthValue(idle, [row("2026-11-01", 1, true, 0), row("2026-11-02", 1, false, 4)])).toBe(4);
  });

  it("variazione solo se c'è l'anno prima", () => {
    expect(yoy(120, 100)).toBeCloseTo(0.2);
    expect(yoy(120, null)).toBeNull();
    expect(yoy(120, 0)).toBeNull();
    expect(yoy(null, 100)).toBeNull();
  });
});
