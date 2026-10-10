// Atom restituisce molti valori come stringhe formattate ("3,50 €", "12.4 km", "-").
// Queste funzioni li convertono in numeri e date senza far fallire la sync.

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let s = value.replace(/[^\d.,-]/g, "");
  if (!s || s === "-" ) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // formato europeo: 1.234,56
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // formato inglese: 1,234.56
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Atom restituisce date come "10/10/26 10:53:07" (gg/mm/aa) nell'ora locale italiana.
const EU_DATE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const ATOM_TZ = "Europe/Rome";

/** Converte un orario "da orologio" in un fuso (es. 10:53 a Roma) nell'istante UTC corrispondente. */
export function zonedTimeToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz = ATOM_TZ): Date {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const offsetAt = (t: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }).formatToParts(new Date(t)).map((x) => [x.type, x.value]),
    );
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t); // seconda passata per i cambi d'ora
  return new Date(t);
}

export function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  if (typeof value === "number") return new Date(value > 1e12 ? value : value * 1000);
  if (typeof value !== "string") return null;
  const s = value.trim();
  const eu = EU_DATE.exec(s);
  if (eu) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = eu;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return zonedTimeToUtc(year, +m, +d, +hh, +mm, +ss);
  }
  // ISO con fuso esplicito: lo rispettiamo; senza fuso: ora locale italiana
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const date = new Date(s);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (iso) {
    const [, y, m, d, hh = "0", mm = "0", ss = "0"] = iso;
    return zonedTimeToUtc(+y, +m, +d, +hh, +mm, +ss);
  }
  return null;
}

export function parseBattery(value: unknown): number | null {
  const n = parseNumber(value);
  if (n === null) return null;
  return Math.round(n <= 1 && n > 0 && typeof value === "number" && !Number.isInteger(value) ? n * 100 : n);
}

/**
 * Stati Atom di un veicolo disponibile per i clienti (in strada).
 * Visti sui dati reali: READY, NOT_READY, NEED_SERVICE, NEED_INVESTIGATION, CHARGING, TRANSPORTATION, STOLEN.
 * Gli stati di corsa/prenotazione contano come in strada.
 */
export const ON_STREET = ["READY", "IN_USE", "IN_RIDE", "RIDING", "RESERVED", "BOOKED", "PAUSED", "AVAILABLE"];

export function isOnStreet(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toUpperCase().replace(/[\s-]+/g, "_");
  const extra = (process.env.ATOM_ON_STREET_STATUSES ?? "")
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  return [...ON_STREET, ...extra].includes(s);
}

/** Etichetta italiana per gli stati Atom. */
export const STATUS_LABEL: Record<string, string> = {
  READY: "Pronto",
  NOT_READY: "Non pronto",
  NEED_SERVICE: "Da riparare",
  NEED_INVESTIGATION: "Da verificare",
  CHARGING: "In ricarica",
  TRANSPORTATION: "In trasporto",
  STOLEN: "Rubato",
};
