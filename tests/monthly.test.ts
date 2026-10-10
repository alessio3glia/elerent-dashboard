import { describe, expect, it } from "vitest";
import { monthsBetween, sameMonthLastYear, totalsByMonth } from "@/lib/metrics/monthly";

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
