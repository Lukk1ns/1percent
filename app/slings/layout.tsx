import type { Metadata } from "next";
import { ICONA_SL_180, ICONA_SL_192 } from "@/lib/omaggio";

/**
 * DONNA OMAGGIO · CULTURE con gli SLINGS, venerdì 13 novembre 2026 (script 56).
 *
 * Staccata dal resto del sito come /maldita: è un servizio che
 * unpercento.it fa per la serata del PAPI-ON. Niente 1%.
 * Il colore è il giallo della locandina ufficiale (5/11).
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://www.unpercento.it"),
  title: "CULTURE · SLINGS — Donna omaggio",
  description:
    "Hip-hop Friday: venerdì 13 novembre al PAPI-ON con gli SLINGS. Le prime 50 ragazze che prenotano qui entrano gratis entro le 00:30.",
  icons: { icon: ICONA_SL_192, apple: ICONA_SL_180 },
  appleWebApp: { title: "CULTURE", capable: true, statusBarStyle: "black-translucent" },
  openGraph: {
    title: "CULTURE · SLINGS — Donna omaggio",
    description: "Venerdì 13 novembre · PAPI-ON · special guest SLINGS · prime 50 donne ingresso omaggio con prenotazione",
    images: [
      {
        url: "/slings/anteprima-slings.jpg",
        width: 1200,
        height: 630,
        alt: "CULTURE con gli SLINGS — donna omaggio, prime 50, venerdì 13 novembre al PAPI-ON",
      },
    ],
  },
};

export default function SlingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col bg-black text-white">
      {/* Copre aurore e griglia del portale: qui la scena è della serata */}
      <div className="fixed inset-0 -z-[5] bg-black" aria-hidden />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 -z-[4] h-[60vh]"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(230,251,5,0.16), transparent 70%)" }}
        aria-hidden
      />
      {children}
    </div>
  );
}
