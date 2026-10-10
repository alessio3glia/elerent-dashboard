/** Scheletro mostrato subito al clic, mentre il server prepara la pagina. */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Caricamento">
      <div className="mb-6 h-8 w-56 rounded-lg bg-surface-2" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 rounded-xl border border-line bg-surface" />
        ))}
      </div>
      <div className="mt-6 h-80 rounded-xl border border-line bg-surface" />
    </div>
  );
}
