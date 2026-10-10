"use client";

import dynamic from "next/dynamic";
import type { LiveVehicle } from "@/lib/fleet-status";
import type { RideEnd } from "./live-map";

// Leaflet usa window: la mappa si carica solo nel browser
const LiveMap = dynamic(() => import("./live-map"), {
  ssr: false,
  loading: () => <div className="h-[480px] animate-pulse rounded-lg bg-surface-2" />,
});

export function LiveMapLoader(props: { vehicles: LiveVehicle[]; rides: RideEnd[] }) {
  return <LiveMap {...props} />;
}
