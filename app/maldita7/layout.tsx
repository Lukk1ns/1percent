import type { Metadata } from "next";
import { ICONA_M7_180, ICONA_M7_192 } from "@/lib/omaggio";

/**
 * SHOT OMAGGIO · MALDITA, sabato 7 novembre 2026 (script 53).
 *
 * Staccata dal resto del sito come /maldita: è un servizio che
 * unpercento.it fa per la serata del PAPI-ON. Niente 1%.
 * Il colore è il rosso della locandina (MALDITA, 3/11).
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://www.unpercento.it"),
  title: "MALDITA — Shot omaggio",
  description:
    "Dembow, dancehall, reggaeton: sabato 7 novembre al PAPI-ON. Registrati qui e, entro le 00:30, al bar hai uno shot offerto.",
  icons: { icon: ICONA_M7_192, apple: ICONA_M7_180 },
  appleWebApp: { title: "MALDITA", capable: true, statusBarStyle: "black-translucent" },
  openGraph: {
    title: "MALDITA — Shot omaggio",
    description: "Sabato 7 novembre · PAPI-ON · Deejlord, DJ Gringo, DJ El Menor · shot offerto al bar entro le 00:30",
    images: [
      {
        url: "/maldita7/anteprima-maldita7.jpg",
        width: 1200,
        height: 630,
        alt: "MALDITA — shot omaggio entro le 00:30, sabato 7 novembre al PAPI-ON",
      },
    ],
  },
};

export default function Maldita7Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col bg-black text-white">
      {/* Copre aurore e griglia del portale: qui la scena è della serata */}
      <div className="fixed inset-0 -z-[5] bg-black" aria-hidden />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 -z-[4] h-[60vh]"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255,58,46,0.22), transparent 70%)" }}
        aria-hidden
      />
      {children}
    </div>
  );
}
