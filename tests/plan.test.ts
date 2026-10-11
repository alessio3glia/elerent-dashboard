import { describe, expect, it } from "vitest";
import type { Finding } from "@/lib/rules/engine";
import { MAX_TASKS_PER_DAY, marketingTasks, planDay } from "@/lib/rules/plan";

const finding = (rule: string, priority: 1 | 2 | 3, severity: Finding["severity"] = "warning"): Finding => ({
  rule,
  severity,
  title: rule,
  detail: rule,
  task: { kind: rule === "contatto_periodico" ? "chiamata" : "verifica", priority, title: rule, action: "-" },
});

describe("piano del giorno", () => {
  it("ogni giorno c'è la notifica del giorno, e il recupero crediti se ci sono debiti", () => {
    const m = marketingTasks("2026-10-12", { openDebts: 4, openDebtAmount: 120 });
    expect(m[0].rule).toBe("notifica:in_calo"); // lunedì
    expect(m.some((t) => t.rule === "recupero:solleciti")).toBe(true);
    expect(marketingTasks("2026-10-12", { openDebts: 0, openDebtAmount: 0 }).some((t) => t.rule.startsWith("recupero"))).toBe(false);
  });

  it("al massimo 30 task, dalle più importanti; le chiamate di routine restano fuori", () => {
    const findings = [
      ...Array.from({ length: 40 }, (_, i) => ({ cityId: i, revenue: i, finding: finding("contatto_periodico", 3, "info") })),
      ...Array.from({ length: 20 }, (_, i) => ({ cityId: 100 + i, revenue: 1000 - i, finding: finding("veicoli_fermi", 2) })),
      { cityId: 500, revenue: 5, finding: finding("nessuna_corsa", 1, "critical") },
    ];
    const plan = planDay(marketingTasks("2026-10-12", { openDebts: 1, openDebtAmount: 10 }), findings, MAX_TASKS_PER_DAY);
    expect(plan).toHaveLength(30);
    expect(plan[0].rule.startsWith("notifica:")).toBe(true);
    expect(plan[1].rule).toBe("nessuna_corsa");
    expect(plan.filter((t) => t.rule === "veicoli_fermi")).toHaveLength(20);
    // Tra le task di pari priorità prima le città che fatturano di più
    expect(plan.find((t) => t.rule === "veicoli_fermi")?.cityId).toBe(100);
    expect(plan.filter((t) => t.rule === "contatto_periodico").length).toBeLessThan(8);
  });
});
