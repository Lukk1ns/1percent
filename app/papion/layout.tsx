import type { Metadata } from "next";

/**
 * unpercento.it/papion — il MENU BOTTIGLIE del PAPI-ON (12 ott).
 *
 * Luka: "caricalo e dammi il link che mi faccio io il qr code" — il QR
 * va sui tavoli. Come /maldita è un servizio che il sito fa al locale:
 * niente 1%, fondo nero sopra il Backdrop, niente tasto "indietro".
 *
 * Non c'entra con gli ordini dal tavolo del gestionale (/t/<codice>):
 * qui il menu si guarda e basta.
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://www.unpercento.it"),
  title: "PAPI-ON · Menu bottiglie",
  description: "Il menu bottiglie del PAPI-ON Music Club, Roveredo in Piano.",
  appleWebApp: { title: "PAPI-ON", capable: true, statusBarStyle: "black-translucent" },
  openGraph: {
    title: "PAPI-ON · Menu bottiglie",
    description: "Il menu bottiglie del PAPI-ON Music Club",
    images: [
      {
        url: "/papion/anteprima-menu.jpg",
        width: 1200,
        height: 630,
        alt: "PAPI-ON Music Club — menu bottiglie",
      },
    ],
  },
};

export default function PapionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col bg-black text-white">
      {/* Copre aurore e griglia del portale: qui la scena è del locale */}
      <div className="fixed inset-0 -z-[5] bg-black" aria-hidden />
      {/* Un alone rosso in alto, come le luci del menu */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 -z-[4] h-[60vh]"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(224,24,31,0.22), transparent 70%)" }}
        aria-hidden
      />
      {children}
    </div>
  );
}
