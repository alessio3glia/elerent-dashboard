"use client";

import { useState } from "react";
import { TileLayer } from "react-leaflet";

/**
 * Sfondi mappa che non richiedono chiavi: Esri grigio scuro (in linea con il tema nero),
 * e OpenStreetMap se il primo non carica.
 */
const SOURCES = [
  {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 16,
  },
  {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
];

export function BaseTiles() {
  const [index, setIndex] = useState(0);
  const [errors, setErrors] = useState(0);
  const source = SOURCES[index];
  return (
    <TileLayer
      key={source.url}
      url={source.url}
      attribution={source.attribution}
      maxNativeZoom={source.maxZoom}
      maxZoom={19}
      eventHandlers={{
        tileerror: () => {
          if (index >= SOURCES.length - 1) return;
          if (errors + 1 >= 3) {
            setIndex(index + 1);
            setErrors(0);
          } else setErrors(errors + 1);
        },
      }}
    />
  );
}
