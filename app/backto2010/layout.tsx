import type { Metadata } from "next";
import { ICONA_2010_180, ICONA_2010_192 } from "@/lib/omaggio";

/**
 * SHOT OMAGGIO · BACK TO 2010, venerdì 30 ottobre 2026 (script 51).
 *
 * Staccata dal resto del sito come /maldita: è un servizio che
 * unpercento.it fa per la serata del PAPI-ON. Niente 1%, niente PR.
 * Il colore è l'arancio della data stampata dalle macchinette del 2010,
 * come nella locandina.
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://www.unpercento.it"),
  title: "BACK TO 2010 — Shot omaggio",
  description:
    "Venerdì 30 ottobre al PAPI-ON. Ingresso gratis per tutti fino all'1: registrati qui e, se entri entro l'1, al bar hai uno shot offerto.",
  icons: { icon: ICONA_2010_192, apple: ICONA_2010_180 },
  appleWebApp: { title: "BACK TO 2010", capable: true, statusBarStyle: "black-translucent" },
  openGraph: {
    title: "BACK TO 2010 — Shot omaggio",
    description: "Venerdì 30 ottobre · PAPI-ON · gratis fino all'1 · shot offerto a chi entra entro l'1",
    images: [
      {
        url: "/backto2010/anteprima-backto2010.jpg",
        width: 1200,
        height: 630,
        alt: "BACK TO 2010 — shot omaggio entro l'1, venerdì 30 ottobre al PAPI-ON",
      },
    ],
  },
};

export default function BackTo2010Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col bg-black text-white">
      {/* Copre aurore e griglia del portale: qui la scena è della serata */}
      <div className="fixed inset-0 -z-[5] bg-black" aria-hidden />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 -z-[4] h-[60vh]"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255,138,31,0.22), transparent 70%)" }}
        aria-hidden
      />
      {children}
    </div>
  );
}
