"use client";

import { BaseTiles } from "./base-tiles";
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Tooltip } from "react-leaflet";

export type MapVehicle = {
  id: number;
  number: string | null;
  lat: number;
  lng: number;
  state: "ok" | "fermo" | "scarico" | "fuori";
  battery: number | null;
  status: string | null;
  lastRide: string | null;
};

const COLORS: Record<MapVehicle["state"], string> = {
  ok: "#1fcb6e",
  fermo: "#f2a93b",
  scarico: "#f0524f",
  fuori: "#7c7c7c",
};

export const STATE_LABEL: Record<MapVehicle["state"], string> = {
  ok: "In strada",
  fermo: "Senza corse da 3+ giorni",
  scarico: "Batteria sotto il 20%",
  fuori: "Fuori servizio",
};

export default function FleetMap({ vehicles, center }: { vehicles: MapVehicle[]; center: [number, number] }) {
  return (
    <MapContainer center={center} zoom={13} scrollWheelZoom className="h-[420px] w-full rounded-lg" style={{ background: "#141414" }}>
      <BaseTiles />
      {vehicles.map((v) => (
        <CircleMarker
          key={v.id}
          center={[v.lat, v.lng]}
          radius={6}
          pathOptions={{ color: "#0a0a0a", weight: 2, fillColor: COLORS[v.state], fillOpacity: 1 }}
        >
          <Tooltip>
            <strong>{v.number ?? v.id}</strong>
            <br />
            {STATE_LABEL[v.state]}
            {v.battery !== null && <> · batteria {v.battery}%</>}
            <br />
            Ultima corsa: {v.lastRide ?? "mai"}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
