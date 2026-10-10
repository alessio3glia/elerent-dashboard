"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Ricarica i dati della pagina a intervalli, così i numeri "in tempo reale" si aggiornano da soli. */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
