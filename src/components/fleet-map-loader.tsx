"use client";

import dynamic from "next/dynamic";
import type { MapVehicle } from "./fleet-map";

// Leaflet usa window: la mappa si carica solo nel browser
const FleetMap = dynamic(() => import("./fleet-map"), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-lg bg-surface-2" />,
});

export function FleetMapLoader(props: { vehicles: MapVehicle[]; center: [number, number] }) {
  return <FleetMap {...props} />;
}
