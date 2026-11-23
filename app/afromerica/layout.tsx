import type { Metadata } from "next";
import { ICONA_AF_180, ICONA_AF_192 } from "@/lib/omaggio";

/**
 * LADIES FREE · DONNA OMAGGIO · AFRO-MERICA, venerdì 27 novembre 2026 (script 68).
 *
 * Staccata dal resto del sito come /slings: è un servizio che
 * unpercento.it fa per la serata del PAPI-ON. Niente 1%.
 * Testi in inglese, l'ingresso anche in italiano; oro della locandina CINEMATIC.
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://www.unpercento.it"),
  title: "AFRO-MERICA — Ladies free · Donna omaggio",
  description:
    "AFRO-MERICA first night · Friday 27 November at PAPI-ON. Ladies free with reservation before 1 AM · donna omaggio con prenotazione entro l'1.",
  icons: { icon: ICONA_AF_192, apple: ICONA_AF_180 },
  appleWebApp: { title: "AFRO-MERICA", capable: true, statusBarStyle: "black-translucent" },
  openGraph: {
    title: "AFRO-MERICA — Ladies free · Donna omaggio",
    description: "Friday 27 November · PAPI-ON · American hip hop × Afrobeats · ladies free with reservation before 1 AM · donna omaggio entro l'1",
    images: [
      {
        url: "/afromerica/anteprima-afromerica.jpg",
        width: 1200,
        height: 630,
        alt: "AFRO-MERICA — ladies free · donna omaggio, Friday 27 November at PAPI-ON",
      },
    ],
  },
};

export default function AfroLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col bg-black text-white">
      {/* Copre aurore e griglia del portale: qui la scena è della serata */}
      <div className="fixed inset-0 -z-[5] bg-black" aria-hidden />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 -z-[4] h-[60vh]"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(224,180,74,0.16), transparent 70%)" }}
        aria-hidden
      />
      {children}
    </div>
  );
}
