import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/fleet-status", () => ({ liveVehicles: async () => [] }));
vi.mock("@/lib/live", () => ({ getLiveState: async () => null }));

const { judgeCity, paceDelta } = await import("@/lib/realtime");
const pace = (today: number, avg4: number) => ({ city_id: 1, today, week1: avg4, avg4, week1Day: avg4 * 2 });

describe("semaforo città", () => {
  it("verde quando corse, segnale e batterie sono nella norma", () => {
    expect(judgeCity({ pace: pace(50, 48), vehicles: 100, signalling: 95, lowBattery: 5, hour: 15 }).health).toBe("verde");
  });

  it("giallo con un calo moderato delle corse", () => {
    const r = judgeCity({ pace: pace(36, 50), vehicles: 100, signalling: 95, lowBattery: 5, hour: 15 });
    expect(r.health).toBe("giallo");
    expect(r.reasons[0]).toContain("-28%");
  });

  it("rosso se la città è ferma o molti mezzi non mandano segnale", () => {
    expect(judgeCity({ pace: pace(0, 20), vehicles: 100, signalling: 95, lowBattery: 5, hour: 13 }).health).toBe("rosso");
    expect(judgeCity({ pace: pace(50, 50), vehicles: 100, signalling: 40, lowBattery: 0, hour: 13 }).health).toBe("rosso");
  });

  it("non giudica il ritmo con troppe poche corse di confronto", () => {
    expect(paceDelta(0, 3)).toBeNull();
    expect(judgeCity({ pace: pace(0, 2), vehicles: 10, signalling: 10, lowBattery: 0, hour: 9 }).health).toBe("verde");
  });
});
