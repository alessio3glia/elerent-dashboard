const time = (d: Date) => d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });

/** Quando sono stati aggiornati i dati, con avviso se la sincronizzazione con Atom è ferma. */
export function Freshness({
  data,
}: {
  data: { syncAt: Date | null; fleetAt: Date | null; lastRideAt: Date | null; subscriptionsAt: Date | null; error: string | null; stale: boolean; minutes: number | null };
}) {
  const items = [
    ["Sincronizzazione", data.syncAt],
    ["Mezzi", data.fleetAt],
    ["Ultima corsa", data.lastRideAt],
    ["Abbonamenti", data.subscriptionsAt],
  ] as const;
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${data.stale || data.error ? "border-warning" : "border-line"}`}>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink-3">
        <span className={`font-medium ${data.stale ? "text-warning" : "text-brand"}`}>
          <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${data.stale ? "bg-warning" : "animate-pulse bg-brand"}`} />
          {data.stale ? "Dati fermi" : "Dati aggiornati"}
        </span>
        {items.map(([label, d]) => (
          <span key={label}>
            {label} <span className="tabular text-ink-2">{d ? time(d) : "—"}</span>
          </span>
        ))}
      </div>
      {data.stale && (
        <div className="mt-1 text-warning">
          {data.minutes === null ? "Nessuna sincronizzazione con Atom ancora fatta." : `Nessuna sincronizzazione con Atom da ${Math.round(data.minutes)} minuti.`}
        </div>
      )}
      {data.error && <div className="mt-1 text-critical">Errore Atom: {data.error}</div>}
    </div>
  );
}
