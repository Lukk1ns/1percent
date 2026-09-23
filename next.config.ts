import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp è un modulo NATIVO: dentro non c'è JavaScript ma un binario
  // compilato per il sistema che lo ospita (@img/sharp-linux-x64 su
  // Vercel, darwin-arm64 sul Mac). Va lasciato fuori dal bundler,
  // altrimenti la funzione parte senza il suo binario e va in errore
  // 500 alla prima riga — è il motivo per cui le foto non si
  // caricavano mentre in locale funzionava tutto.
  serverExternalPackages: ["sharp"],

  // E va anche COPIATO nella funzione: sharp sceglie il binario a
  // runtime, quindi chi prepara il pacchetto non lo vede e non se lo
  // porta dietro. Qui gli si dice a mano quali route ne hanno bisogno.
  outputFileTracingIncludes: {
    "/api/foto/upload": ["./node_modules/@img/**"],
    "/api/volto": ["./node_modules/@img/**"],
    "/api/locandina": ["./node_modules/@img/**"],
    "/api/locandina/vista": ["./node_modules/@img/**"],
  },
};

export default nextConfig;
