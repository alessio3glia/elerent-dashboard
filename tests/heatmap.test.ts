import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {}, schema: {} }));
vi.mock("@/lib/atom/client", () => ({}));

const { hotCells, inCell, meters, toZone } = await import("@/lib/heatmap");
const cell = (lat: number, dep: number) => ({ lat, lng: 15, dLat: 0.002, dLng: 0.002, dep, arr: 0 });

describe("heatmap", () => {
  it("le zone calde sono le celle con più partenze fino a metà del totale", () => {
    const hot = hotCells([cell(1, 10), cell(2, 50), cell(3, 30), cell(4, 10)]);
    expect(hot.map((c) => c.dep)).toEqual([50]);
    expect(hotCells([cell(1, 10), cell(2, 40), cell(3, 30), cell(4, 20)]).map((c) => c.dep)).toEqual([40, 30]);
  });

  it("riconosce i punti dentro una cella e misura le distanze", () => {
    expect(inCell({ lat: 1.001, lng: 15.001 }, cell(1, 1))).toBe(true);
    expect(inCell({ lat: 1.003, lng: 15.001 }, cell(1, 1))).toBe(false);
    expect(Math.round(meters({ lat: 38.19, lng: 15.55 }, { lat: 38.2, lng: 15.55 }))).toBe(1112);
  });

  it("legge le zone di Atom con obiettivi per tipo o singoli", () => {
    expect(toZone({ id: 1, title: "Stazione", coordinates: { latitude: 38.1, longitude: 15.6 }, radius: 150, vehicle_type_and_count: [{ vehicle_type: "SCOOTER", count: 5 }, { vehicle_type: "E_BIKE", count: 2 }] })?.target).toBe(7);
    expect(toZone({ id: 2, coordinates: { latitude: 38.1, longitude: 15.6 }, count: 4 })).toMatchObject({ title: "Zona 2", target: 4, radius: 100 });
    expect(toZone({ id: 3, coordinates: null })).toBeNull();
  });
});
