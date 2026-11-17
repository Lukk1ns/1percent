import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { ICONA_PPR_180, ICONA_PPR_192, LINK_PAPION } from "@/lib/papion-pr";

/** Il carattere del logo PAPI-ON: qui la scena è del locale, non dell'1%. */
const montserrat = Montserrat({
  variable: "--font-mont",
  weight: ["500", "600", "700", "800", "900"],
  subsets: ["latin"],
});

/**
 * L'app di un PR del PAPI-ON (script 61). Come le pagine personali di
 * MALDITA: icona PAPI-ON, si apre a tutto schermo e riparte sempre dalla
 * SUA pagina — per questo il manifest è uno per persona.
 *
 * Non finisce su Google: chi ha il link è lui.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ link: string }>;
}): Promise<Metadata> {
  const { link } = await params;
  const valido = LINK_PAPION.test(link);
  return {
    title: "PAPI-ON · PR",
    description: "La tua app di PR del PAPI-ON Music Club",
    robots: { index: false, follow: false },
    manifest: valido ? `/papion/pr/${link}/manifest` : undefined,
    icons: { icon: ICONA_PPR_192, apple: ICONA_PPR_180 },
    appleWebApp: { title: "PAPI-ON", capable: true, statusBarStyle: "black-translucent" },
    // l'anteprima del link su WhatsApp non deve essere il menu bottiglie
    openGraph: {
      title: "PAPI-ON · la tua app PR",
      description: "Aprila e mettila sulla schermata Home",
      images: [{ url: "/papion/pr/icona-512.png", width: 512, height: 512, alt: "PAPI-ON" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function AppPRLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${montserrat.variable} flex flex-1 flex-col`}>{children}</div>;
}
