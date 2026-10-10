import { describe, expect, it } from "vitest";
import { cityForPoint } from "@/lib/geo";
import { buildMetric, elerentRevenue } from "@/lib/metrics/build";

describe("cityForPoint", () => {
  const areas = [
    { id: 1, centerLat: 45.4642, centerLng: 9.19, radiusKm: 15 },
    { id: 2, centerLat: 45.07, centerLng: 7.69, radiusKm: 15 },
  ];
  it("assegna alla città il cui raggio contiene il punto", () => {
    expect(cityForPoint({ lat: 45.48, lng: 9.2 }, areas)).toBe(1);
    expect(cityForPoint({ lat: 45.06, lng: 7.68 }, areas)).toBe(2);
  });
  it("restituisce null fuori da tutte le aree", () => {
    expect(cityForPoint({ lat: 41.9, lng: 12.5 }, areas)).toBeNull();
    expect(cityForPoint(null, areas)).toBeNull();
  });
});

describe("ricavo Elerent", () => {
  it("somma 10% del fatturato e la fee giornaliera dei veicoli attivi nei 30 giorni", () => {
    // 10% di 1000 € + 30 veicoli × 15 €/mese / 31 giorni
    expect(elerentRevenue(1000, 30, 10, 15, "2026-10-08")).toBeCloseTo(100 + (30 * 15) / 31);
  });
});

describe("buildMetric", () => {
  const base = {
    day: "2026-10-08",
    revenueSharePct: 10,
    feePerVehicleMonth: 0,
    rides: 3,
    revenue: 9,
    uniqueCustomers: 2,
    newCustomers: 1,
    vehiclesWithRideToday: new Set([1]),
    vehiclesWithRecentRide: new Set([1]),
    vehiclesActiveLast7: 5,
    vehiclesActiveLast30: 8,
  };

  it("usa la foto della flotta quando c'è", () => {
    const snapshot = [
      { atomId: 1, status: "AVAILABLE", battery: 80, lat: 45, lng: 9 },
      { atomId: 2, status: "AVAILABLE", battery: 10, lat: 45, lng: 9 },
      { atomId: 3, status: "MAINTENANCE", battery: 50, lat: 45, lng: 9 },
    ];
    const previousSnapshot = [
      { atomId: 1, status: "AVAILABLE", battery: 90, lat: 45, lng: 9 },
      { atomId: 2, status: "AVAILABLE", battery: 15, lat: 45, lng: 9 },
    ];
    const m = buildMetric({ ...base, snapshot, previousSnapshot });
    expect(m.estimated).toBe(false);
    expect(m.fleetSize).toBe(3);
    expect(m.activeVehicles).toBe(2);
    expect(m.lowBattery).toBe(1);
    expect(m.idleVehicles).toBe(1); // il veicolo 2 non ha corse recenti
    expect(m.stationaryVehicles).toBe(1); // il veicolo 1 non conta: ha fatto corse
    expect(m.feeVehicles).toBe(8);
    expect(m.elerentRevenue).toBeCloseTo(0.9); // fee a 0 in questo test
  });

  it("stima la flotta dalle corse nei giorni storici", () => {
    const m = buildMetric({ ...base, snapshot: [], previousSnapshot: [] });
    expect(m.estimated).toBe(true);
    expect(m.activeVehicles).toBe(5);
    expect(m.idleVehicles).toBe(0);
  });
});
