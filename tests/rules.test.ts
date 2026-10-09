import { describe, expect, it } from "vitest";
import { evaluateCity, networkRidesPerVehicle, type MetricDay } from "@/lib/rules/engine";
import { addDays } from "@/lib/dates";

const day = (i: number, patch: Partial<MetricDay> = {}): MetricDay => ({
  day: addDays("2026-09-10", i),
  rides: 200,
  revenue: 800,
  fleetSize: 100,
  activeVehicles: 100,
  idleVehicles: 5,
  lowBattery: 5,
  stationaryVehicles: 10,
  elerentRevenue: 120,
  ...patch,
});

const ctx = (metrics: MetricDay[], extra = {}) => ({
  name: "Test",
  affiliateName: "Affiliato Test",
  contactName: "Marco",
  lastContactAt: new Date("2026-10-07"),
  metrics,
  networkRidesPerVehicle: 2,
  ...extra,
});

const today = new Date("2026-10-09T08:00:00Z");
const rules = (f: ReturnType<typeof evaluateCity>) => f.map((x) => x.rule).sort();

describe("evaluateCity", () => {
  it("nessun alert per una città stabile e contattata di recente", () => {
    const m = Array.from({ length: 28 }, (_, i) => day(i));
    expect(evaluateCity(ctx(m), today)).toEqual([]);
  });

  it("segnala un calo forte di fatturato come critico con chiamata ad alta priorità", () => {
    const m = Array.from({ length: 14 }, (_, i) => day(i, { revenue: i < 7 ? 1000 : 600 }));
    const f = evaluateCity(ctx(m), today).find((x) => x.rule === "calo_fatturato")!;
    expect(f.severity).toBe("critical");
    expect(f.task.priority).toBe(1);
    expect(f.task.title).toContain("Marco");
  });

  it("segnala meno veicoli in strada, veicoli fermi, batteria e riposizionamento", () => {
    const m = Array.from({ length: 8 }, (_, i) =>
      day(i, i === 7 ? { activeVehicles: 80, idleVehicles: 30, lowBattery: 20, stationaryVehicles: 60 } : {}),
    );
    expect(rules(evaluateCity(ctx(m), today))).toEqual(
      ["batteria_bassa", "calo_veicoli", "riposizionamento", "veicoli_fermi"].sort(),
    );
  });

  it("segnala zero corse con veicoli in strada", () => {
    const f = evaluateCity(ctx([day(0, { rides: 0, revenue: 0 })]), today);
    expect(f[0].rule).toBe("nessuna_corsa");
    expect(f[0].severity).toBe("critical");
  });

  it("segnala il trend negativo su 3 settimane", () => {
    const m = Array.from({ length: 28 }, (_, i) => day(i, { rides: 260 - Math.floor(i / 7) * 20 }));
    expect(rules(evaluateCity(ctx(m), today))).toContain("trend_negativo");
  });

  it("propone una chiamata di routine solo se non ci sono altre chiamate", () => {
    const stable = Array.from({ length: 7 }, (_, i) => day(i));
    expect(rules(evaluateCity(ctx(stable, { lastContactAt: null }), today))).toEqual(["contatto_periodico"]);
    const zero = [day(0, { rides: 0 })];
    expect(rules(evaluateCity(ctx(zero, { lastContactAt: null }), today))).not.toContain("contatto_periodico");
  });

  it("segnala utilizzo basso rispetto alla rete", () => {
    const m = Array.from({ length: 7 }, (_, i) => day(i, { rides: 50 }));
    expect(rules(evaluateCity(ctx(m), today))).toContain("utilizzo_basso");
  });
});

describe("networkRidesPerVehicle", () => {
  it("calcola la mediana tra le città", () => {
    const c = (rides: number) => Array.from({ length: 7 }, (_, i) => day(i, { rides }));
    expect(networkRidesPerVehicle([c(100), c(200), c(400)])).toBe(2);
  });
});
