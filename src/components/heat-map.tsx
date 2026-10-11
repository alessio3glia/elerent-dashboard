"use client";

import { BaseTiles } from "./base-tiles";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleMarker, MapContainer, Rectangle, Tooltip, useMap } from "react-leaflet";
import type { LiveVehicle } from "@/lib/fleet-status";

export type MapCell = { lat: number; lng: number; dLat: number; dLng: number; dep: number; arr: number; hot: boolean };
export type MapZone = { id: number; title: string; lat: number; lng: number; radius: number; target: number; present: number };
type Layer = "partenze" | "arrivi" | "saldo";

const LAYERS: Record<Layer, string> = {
  partenze: "Partenze",
  arrivi: "Arrivi",
  saldo: "Saldo arrivi − partenze",
};

const VEHICLE: Record<LiveVehicle["state"], { color: string; label: string }> = {
  corsa: { color: "#39ff8f", label: "In corsa" },
  operativo: { color: "#f4f4f4", label: "Disponibile / con segnale" },
  spento: { color: "#5a5a5a", label: "Senza segnale" },
};

function FitOnce({ points }: { points: [number, number][] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || points.length === 0) return;
    done.current = true;
    map.fitBounds(points, { padding: [20, 20], maxZoom: 15 });
  }, [map, points]);
  return null;
}

export default function HeatMap({ cells, vehicles, zones }: { cells: MapCell[]; vehicles: LiveVehicle[]; zones: MapZone[] }) {
  const [layer, setLayer] = useState<Layer>("partenze");
  const [showVehicles, setShowVehicles] = useState(true);
  const [showZones, setShowZones] = useState(zones.length > 0);
  const [showHot, setShowHot] = useState(false);

  const value = (c: MapCell) => (layer === "partenze" ? c.dep : layer === "arrivi" ? c.arr : c.arr - c.dep);
  const max = useMemo(() => Math.max(1, ...cells.map((c) => Math.abs(layer === "partenze" ? c.dep : layer === "arrivi" ? c.arr : c.arr - c.dep))), [cells, layer]);
  const points = useMemo(
    () => (cells.length ? cells.map((c) => [c.lat + c.dLat / 2, c.lng + c.dLng / 2] as [number, number]) : vehicles.map((v) => [v.lat, v.lng] as [number, number])),
    [cells, vehicles],
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {(Object.keys(LAYERS) as Layer[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLayer(l)}
            className={`rounded-lg px-3 py-1.5 ${layer === l ? "bg-brand-soft font-medium text-brand" : "text-ink-3 hover:text-ink"}`}
          >
            {LAYERS[l]}
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-line" />
        <label className="flex items-center gap-1.5 text-ink-2">
          <input type="checkbox" checked={showVehicles} onChange={(e) => setShowVehicles(e.target.checked)} className="accent-[var(--brand)]" /> Mezzi ora
        </label>
        <label className="flex items-center gap-1.5 text-ink-2">
          <input type="checkbox" checked={showHot} onChange={(e) => setShowHot(e.target.checked)} className="accent-[var(--brand)]" /> Zone calde
        </label>
        {zones.length > 0 && (
          <label className="flex items-center gap-1.5 text-ink-2">
            <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} className="accent-[var(--brand)]" /> Zone di riequilibrio Atom
          </label>
        )}
      </div>

      <MapContainer center={[41.9, 12.5]} zoom={6} scrollWheelZoom className="h-[560px] w-full rounded-lg" style={{ background: "#0a0a0a" }}>
        <BaseTiles />
        <FitOnce points={points} />
        {cells.map((c) => {
          const v = value(c);
          if (v === 0) return null;
          const intensity = Math.sqrt(Math.abs(v) / max);
          const color = layer === "saldo" ? (v > 0 ? "#1fcb6e" : "#f2a93b") : "#1fcb6e";
          return (
            <Rectangle
              key={`${c.lat}:${c.lng}`}
              bounds={[
                [c.lat, c.lng],
                [c.lat + c.dLat, c.lng + c.dLng],
              ]}
              pathOptions={{ stroke: showHot && c.hot, color: "#f4f4f4", weight: 1.5, fillColor: color, fillOpacity: 0.12 + intensity * 0.68 }}
            >
              <Tooltip>
                {c.dep} partenze · {c.arr} arrivi
                {layer === "saldo" && <> · {v > 0 ? `qui si accumulano ${v} mezzi` : `qui mancano ${-v} mezzi`}</>}
                {c.hot && <><br />zona calda</>}
              </Tooltip>
            </Rectangle>
          );
        })}
        {showZones &&
          zones.map((z) => {
            const short = z.present < z.target;
            return (
              <Circle key={`z${z.id}`} center={[z.lat, z.lng]} radius={z.radius} pathOptions={{ color: short ? "#f0524f" : "#8fb4ff", weight: 2, fillOpacity: 0.05, dashArray: "4 4" }}>
                <Tooltip>
                  <strong>{z.title}</strong>
                  <br />
                  obiettivo {z.target} · presenti ora {z.present}
                </Tooltip>
              </Circle>
            );
          })}
        {showVehicles &&
          vehicles.map((v) => (
            <CircleMarker
              key={v.id}
              center={[v.lat, v.lng]}
              radius={v.state === "corsa" ? 5 : 3.5}
              pathOptions={{ color: "#0a0a0a", weight: 1, fillColor: VEHICLE[v.state].color, fillOpacity: 1 }}
            >
              <Tooltip>
                <strong>{v.number ?? v.id}</strong> · {VEHICLE[v.state].label}
                {v.battery !== null && <> · batteria {v.battery}%</>}
              </Tooltip>
            </CircleMarker>
          ))}
      </MapContainer>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-3">
        {layer === "saldo" ? (
          <>
            <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-brand" />arrivano più mezzi di quanti ne partono (si accumulano)</span>
            <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-warning" />partono più mezzi di quanti ne arrivano (da rifornire)</span>
          </>
        ) : (
          <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-brand" />più è intenso, più {layer === "partenze" ? "corse partono" : "corse finiscono"} in quei 200 m</span>
        )}
        {showVehicles &&
          (Object.keys(VEHICLE) as LiveVehicle["state"][]).map((s) => (
            <span key={s}><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: VEHICLE[s].color }} />{VEHICLE[s].label}</span>
          ))}
        {showZones && <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border-2 border-critical" />zona sotto obiettivo</span>}
      </div>
    </div>
  );
}
