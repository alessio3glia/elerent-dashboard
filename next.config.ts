import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le pagine già visitate (o preparate passando col mouse sul menu) si riaprono all'istante per 3 minuti,
  // poi si ricaricano dal server. La home si aggiorna comunque da sola ogni minuto.
  experimental: { staleTimes: { dynamic: 180, static: 300 } },
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
