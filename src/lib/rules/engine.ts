// Motore di regole: dai KPI giornalieri di una città produce alert e task per il dipendente.
// Funzioni pure, senza database: facili da testare e da tarare.

export type MetricDay = {
  day: string;
  rides: number;
  revenue: number;
  fleetSize: number;
  activeVehicles: number;
  idleVehicles: number;
  lowBattery: number;
  stationaryVehicles: number;
  elerentRevenue: number;
};

export type CityContext = {
  name: string;
  affiliateName: string | null;
  contactName: string | null;
  lastContactAt: Date | null;
  /** KPI ordinati per giorno crescente, l'ultimo è "ieri" (ultimo giorno completo). */
  metrics: MetricDay[];
  /** Mediana di rete delle corse per veicolo attivo al giorno (ultimi 7 giorni). */
  networkRidesPerVehicle: number | null;
};

export type Severity = "critical" | "warning" | "info";
export type TaskKind = "chiamata" | "verifica" | "ottimizzazione";

export type Finding = {
  rule: string;
  severity: Severity;
  title: string;
  detail: string;
  data?: Record<string, number | string | null>;
  task: { kind: TaskKind; priority: 1 | 2 | 3; title: string; action: string };
};

export const THRESHOLDS = {
  revenueDropWarning: 0.15,
  revenueDropCritical: 0.3,
  fleetDrop: 0.1,
  idleShare: 0.15,
  lowBatteryShare: 0.2,
  stationaryShare: 0.6,
  lowUtilizationRatio: 0.6,
  checkInDays: 14,
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const eur = (x: number) => `${Math.round(x).toLocaleString("it-IT", { useGrouping: "always" })} €`;

export function evaluateCity(ctx: CityContext, today: Date = new Date()): Finding[] {
  const m = ctx.metrics;
  const out: Finding[] = [];
  const who = ctx.contactName ?? ctx.affiliateName ?? `l'affiliato di ${ctx.name}`;
  if (m.length === 0) return out;
  const last = m[m.length - 1];

  // 1. Nessuna corsa ieri con flotta in strada: possibile blocco operativo
  if (last.rides === 0 && last.activeVehicles > 0) {
    out.push({
      rule: "nessuna_corsa",
      severity: "critical",
      title: `${ctx.name}: zero corse ieri`,
      detail: `${last.activeVehicles} veicoli risultano in strada ma non è stata registrata nessuna corsa.`,
      data: { activeVehicles: last.activeVehicles },
      task: {
        kind: "chiamata",
        priority: 1,
        title: `Chiama ${who}: zero corse ieri a ${ctx.name}`,
        action: "Verificare subito se l'app, i veicoli o la zona hanno un problema (blocco, maltempo, ordinanza, veicoli scarichi).",
      },
    });
  }

  // 2. Calo fatturato: ultimi 7 giorni contro i 7 precedenti
  if (m.length >= 14) {
    const curr = sum(m.slice(-7).map((d) => d.revenue));
    const prev = sum(m.slice(-14, -7).map((d) => d.revenue));
    if (prev > 0) {
      const change = (curr - prev) / prev;
      if (change <= -THRESHOLDS.revenueDropWarning) {
        const critical = change <= -THRESHOLDS.revenueDropCritical;
        out.push({
          rule: "calo_fatturato",
          severity: critical ? "critical" : "warning",
          title: `${ctx.name}: fatturato ${pct(change)} in 7 giorni`,
          detail: `Ultimi 7 giorni ${eur(curr)} contro ${eur(prev)} della settimana prima.`,
          data: { current: curr, previous: prev, change },
          task: {
            kind: "chiamata",
            priority: critical ? 1 : 2,
            title: `Chiama ${who}: fatturato in calo del ${pct(-change)}`,
            action: "Capire la causa (veicoli fermi, meno veicoli in strada, concorrenza, meteo, eventi) e concordare un'azione concreta.",
          },
        });
      }
    }
  }

  // 3. Meno veicoli in strada rispetto alla settimana precedente
  if (m.length >= 8) {
    const before = avg(m.slice(-8, -1).map((d) => d.activeVehicles));
    if (before > 0) {
      const change = (last.activeVehicles - before) / before;
      if (change <= -THRESHOLDS.fleetDrop) {
        out.push({
          rule: "calo_veicoli",
          severity: change <= -0.25 ? "critical" : "warning",
          title: `${ctx.name}: veicoli in strada ${pct(change)}`,
          detail: `${last.activeVehicles} veicoli in strada contro una media di ${Math.round(before)} nei 7 giorni prima.`,
          data: { activeVehicles: last.activeVehicles, average: before, change },
          task: {
            kind: "chiamata",
            priority: change <= -0.25 ? 1 : 2,
            title: `Chiama ${who}: ${Math.round(before - last.activeVehicles)} veicoli in meno in strada`,
            action: "Chiedere quali veicoli sono in manutenzione o ricarica e quando torneranno disponibili.",
          },
        });
      }
    }
  }

  // 4. Veicoli in strada senza corse da 3 giorni
  if (last.activeVehicles > 0 && last.idleVehicles / last.activeVehicles >= THRESHOLDS.idleShare) {
    const share = last.idleVehicles / last.activeVehicles;
    out.push({
      rule: "veicoli_fermi",
      severity: share >= 0.3 ? "critical" : "warning",
      title: `${ctx.name}: ${last.idleVehicles} veicoli senza corse da 3 giorni`,
      detail: `Il ${pct(share)} dei veicoli in strada non fa corse da almeno 3 giorni.`,
      data: { idle: last.idleVehicles, share },
      task: {
        kind: "verifica",
        priority: share >= 0.3 ? 1 : 2,
        title: `Far controllare ${last.idleVehicles} veicoli fermi a ${ctx.name}`,
        action: "Verificare se sono guasti, scarichi o in zone poco frequentate e spostarli dove c'è domanda.",
      },
    });
  }

  // 5. Batteria bassa
  if (last.activeVehicles > 0 && last.lowBattery / last.activeVehicles >= THRESHOLDS.lowBatteryShare) {
    out.push({
      rule: "batteria_bassa",
      severity: "warning",
      title: `${ctx.name}: ${last.lowBattery} veicoli con batteria sotto il 20%`,
      detail: `Il ${pct(last.lowBattery / last.activeVehicles)} della flotta in strada è quasi scarico.`,
      data: { lowBattery: last.lowBattery },
      task: {
        kind: "verifica",
        priority: 2,
        title: `Sollecitare ricarica/cambio batterie a ${ctx.name}`,
        action: "Chiedere all'affiliato il giro di ricarica di oggi e verificare a fine giornata che sia stato fatto.",
      },
    });
  }

  // 6. Riposizionamento non fatto: veicoli rimasti nello stesso punto senza corse
  if (last.activeVehicles > 0 && last.stationaryVehicles / last.activeVehicles >= THRESHOLDS.stationaryShare) {
    out.push({
      rule: "riposizionamento",
      severity: "warning",
      title: `${ctx.name}: riposizionamento probabilmente non fatto`,
      detail: `${last.stationaryVehicles} veicoli su ${last.activeVehicles} sono nello stesso punto del giorno prima e non hanno fatto corse.`,
      data: { stationary: last.stationaryVehicles },
      task: {
        kind: "verifica",
        priority: 2,
        title: `Verificare il riposizionamento a ${ctx.name}`,
        action: "Controllare la mappa e chiedere all'affiliato quando è previsto il prossimo giro di ribilanciamento.",
      },
    });
  }

  // 7. Utilizzo basso rispetto al resto della rete
  if (ctx.networkRidesPerVehicle && m.length >= 7) {
    const week = m.slice(-7);
    const vehicleDays = sum(week.map((d) => d.activeVehicles));
    const rpv = vehicleDays > 0 ? sum(week.map((d) => d.rides)) / vehicleDays : 0;
    if (vehicleDays > 0 && rpv < ctx.networkRidesPerVehicle * THRESHOLDS.lowUtilizationRatio) {
      out.push({
        rule: "utilizzo_basso",
        severity: "info",
        title: `${ctx.name}: ${rpv.toFixed(1)} corse per veicolo al giorno`,
        detail: `La media della rete è ${ctx.networkRidesPerVehicle.toFixed(1)}. Ci sono probabilmente troppi veicoli o veicoli nei posti sbagliati.`,
        data: { ridesPerVehicle: rpv, network: ctx.networkRidesPerVehicle },
        task: {
          kind: "ottimizzazione",
          priority: 3,
          title: `Rivedere la disposizione dei veicoli a ${ctx.name}`,
          action: "Confrontare le zone con più corse con dove sono parcheggiati i veicoli e proporre all'affiliato nuovi punti di rilascio.",
        },
      });
    }
  }

  // 8. Trend negativo: corse in calo per 3 settimane di fila
  if (m.length >= 28) {
    const weeks = [0, 1, 2, 3].map((i) => sum(m.slice(m.length - 7 * (4 - i), m.length - 7 * (3 - i)).map((d) => d.rides)));
    if (weeks[0] > weeks[1] && weeks[1] > weeks[2] && weeks[2] > weeks[3]) {
      out.push({
        rule: "trend_negativo",
        severity: "warning",
        title: `${ctx.name}: corse in calo da 3 settimane`,
        detail: `Corse settimanali: ${weeks.join(" → ")}.`,
        data: { w1: weeks[0], w2: weeks[1], w3: weeks[2], w4: weeks[3] },
        task: {
          kind: "chiamata",
          priority: 2,
          title: `Analizzare con ${who} il calo delle ultime 3 settimane`,
          action: "Preparare i numeri, chiamare l'affiliato e concordare un piano (promo, nuove zone, più veicoli in strada).",
        },
      });
    }
  }

  // 9. Contatto periodico con l'affiliato
  const daysSinceContact = ctx.lastContactAt ? (today.getTime() - ctx.lastContactAt.getTime()) / 86_400_000 : Infinity;
  if (daysSinceContact >= THRESHOLDS.checkInDays && !out.some((f) => f.task.kind === "chiamata")) {
    out.push({
      rule: "contatto_periodico",
      severity: "info",
      title: `${ctx.name}: nessun contatto da ${Number.isFinite(daysSinceContact) ? Math.floor(daysSinceContact) + " giorni" : "sempre"}`,
      detail: "Chiamata di routine per capire come va e se serve supporto.",
      task: {
        kind: "chiamata",
        priority: 3,
        title: `Chiamata di routine a ${who}`,
        action: "Chiedere come va, stato dei veicoli, problemi aperti e prossimi passi. Annotare l'esito.",
      },
    });
  }

  return out;
}

/** Mediana delle corse per veicolo al giorno sugli ultimi 7 giorni, tra le città con flotta. */
export function networkRidesPerVehicle(perCity: MetricDay[][]): number | null {
  const values = perCity
    .map((m) => {
      const week = m.slice(-7);
      const vd = sum(week.map((d) => d.activeVehicles));
      return vd > 0 ? sum(week.map((d) => d.rides)) / vd : null;
    })
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  if (!values.length) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}
