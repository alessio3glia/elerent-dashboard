"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LiveVehicle } from "@/lib/fleet-status";

export type RideEnd = { id: number; lat: number; lng: number; minutesAgo: number; price: number | null };

const STYLE: Record<LiveVehicle["state"], { color: string; radius: number; label: string }> = {
  corsa: { color: "#39ff8f", radius: 6, label: "In corsa / in movimento" },
  operativo: { color: "#1fcb6e", radius: 4, label: "Operativo, manda segnale" },
  spento: { color: "#5a5a5a", radius: 3, label: "Nessun segnale" },
};

/** Inquadra tutti i veicoli solo la prima volta: dopo, gli aggiornamenti non spostano la mappa. */
function FitOnce({ points }: { points: [number, number][] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || points.length === 0) return;
    done.current = true;
    map.fitBounds(points, { padding: [20, 20], maxZoom: 13 });
  }, [map, points]);
  return null;
}

export default function LiveMap({ vehicles, rides }: { vehicles: LiveVehicle[]; rides: RideEnd[] }) {
  const order = { spento: 0, operativo: 1, corsa: 2 };
  const sorted = [...vehicles].sort((a, b) => order[a.state] - order[b.state]);
  const focus = vehicles.filter((v) => v.state !== "spento").map((v) => [v.lat, v.lng] as [number, number]);
  return (
    <MapContainer center={[41.9, 12.5]} zoom={6} scrollWheelZoom className="h-[480px] w-full rounded-lg" style={{ background: "#0a0a0a" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <FitOnce points={focus.length ? focus : vehicles.map((v) => [v.lat, v.lng])} />
      {rides.map((r) => (
        <CircleMarker
          key={`r${r.id}`}
          center={[r.lat, r.lng]}
          radius={14}
          className="ride-glow"
          pathOptions={{ color: "#39ff8f", weight: 2, fillColor: "#39ff8f", fillOpacity: 0.25, opacity: Math.max(0.3, 1 - r.minutesAgo / 30) }}
        >
          <Tooltip>
            Corsa finita {r.minutesAgo < 1 ? "ora" : `${Math.round(r.minutesAgo)} min fa`}
            {r.price !== null && <> · {r.price.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</>}
          </Tooltip>
        </CircleMarker>
      ))}
      {sorted.map((v) => {
        const s = STYLE[v.state];
        return (
          <CircleMarker
            key={v.id}
            center={[v.lat, v.lng]}
            radius={s.radius}
            className={v.state === "corsa" ? "ride-glow" : undefined}
            pathOptions={{ color: v.state === "corsa" ? s.color : "#0a0a0a", weight: v.state === "corsa" ? 2 : 1, fillColor: s.color, fillOpacity: 1 }}
          >
            <Tooltip>
              <strong>{v.number ?? v.id}</strong>
              <br />
              {s.label}
              {v.battery !== null && <> · batteria {v.battery}%</>}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

export const LIVE_LEGEND = STYLE;
