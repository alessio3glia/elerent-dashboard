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

const EU_DATE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

export function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  if (typeof value === "number") return new Date(value > 1e12 ? value : value * 1000);
  if (typeof value !== "string") return null;
  const s = value.trim();
  const eu = EU_DATE.exec(s);
  if (eu) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = eu;
    return new Date(Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss));
  }
  const iso = s.includes("T") || /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(" ", "T") + "Z";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseBattery(value: unknown): number | null {
  const n = parseNumber(value);
  if (n === null) return null;
  return Math.round(n <= 1 && n > 0 && typeof value === "number" && !Number.isInteger(value) ? n * 100 : n);
}

/** Stati Atom che consideriamo "fuori strada". Da verificare sui dati reali. */
const OFF_STREET = ["SERVICE", "MAINTENANCE", "REPAIR", "STORAGE", "WAREHOUSE", "LOST", "STOLEN", "BROKEN", "OUT_OF_ORDER", "TRANSPORT", "CHARGING", "DISABLED", "INACTIVE", "UNAVAILABLE"];

export function isOnStreet(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toUpperCase().replace(/[\s-]+/g, "_");
  const extra = (process.env.ATOM_OFF_STREET_STATUSES ?? "")
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  return ![...OFF_STREET, ...extra].some((off) => s.includes(off));
}
