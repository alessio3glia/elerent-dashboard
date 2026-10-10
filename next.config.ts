import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le pagine già visitate si riaprono all'istante per 30 secondi (poi si ricaricano dal server).
  experimental: { staleTimes: { dynamic: 30 } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
