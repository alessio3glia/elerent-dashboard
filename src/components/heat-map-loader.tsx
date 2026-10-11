"use client";

import dynamic from "next/dynamic";
import type { LiveVehicle } from "@/lib/fleet-status";
import type { MapCell, MapZone } from "./heat-map";

// Leaflet usa window: la mappa si carica solo nel browser
const HeatMap = dynamic(() => import("./heat-map"), {
  ssr: false,
  loading: () => <div className="h-[600px] animate-pulse rounded-lg bg-surface-2" />,
});

export function HeatMapLoader(props: { cells: MapCell[]; vehicles: LiveVehicle[]; zones: MapZone[] }) {
  return <HeatMap {...props} />;
}
