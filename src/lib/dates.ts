export const TZ = "Europe/Rome";

/** Data locale (Europe/Rome) in formato YYYY-MM-DD. */
export function localDay(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysInMonth(day: string): number {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function formatDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}
