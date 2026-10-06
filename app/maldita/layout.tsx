import type { Metadata } from "next";
import { ICONA_180, ICONA_192 } from "@/lib/omaggio";

/**
 * DONNA OMAGGIO · MALDITA, sabato 17 ottobre 2026 (script 42).
 *
 * Una pagina staccata dal resto del sito, per decisione di Luka: è un
 * servizio che unpercento.it fa per l'apertura del nuovo PAPI-ON. Niente
 * 1%, niente PR, niente iscrizione al sito: la grafica è quella della
 * serata e il fondo nero copre lo sfondo animato del portale.
 *
 * L'anteprima del link (WhatsApp, Instagram) mostra la locandina.
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://www.unpercento.it"),
  title: "MALDITA · Official Opening — Donna omaggio",
  description:
    "Sabato 17 ottobre al nuovo PAPI-ON. Ingresso omaggio per le ragazze che entrano entro le 00:30: prenota qui il tuo QR.",
  icons: { icon: ICONA_192, apple: ICONA_180 },
  appleWebApp: { title: "MALDITA", capable: true, statusBarStyle: "black-translucent" },
  openGraph: {
    title: "MALDITA · Official Opening — Donna omaggio",
    description: "Sabato 17 ottobre · PAPI-ON · omaggio entro le 00:30, posti limitati",
    // Orizzontale apposta (Luka, 6 ott): la locandina verticale nel riquadro
    // dell'anteprima restava piccola col vuoto ai lati.
    images: [
      {
        url: "/maldita/anteprima-maldita.jpg",
        width: 1200,
        height: 630,
        alt: "Donna omaggio entro le 00:30 — MALDITA Official Opening, sabato 17 ottobre al PAPI-ON",
      },
    ],
  },
};

export default function MalditaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col bg-black text-white">
      {/* Copre aurore e griglia del portale: qui la scena è della serata */}
      <div className="fixed inset-0 -z-[5] bg-black" aria-hidden />
      {/* Un alone rosso in alto, come le luci della locandina */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 -z-[4] h-[60vh]"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(224,24,31,0.28), transparent 70%)" }}
        aria-hidden
      />
      {children}
    </div>
  );
}
