import type { Metadata } from "next";
import { ICONA_180, ICONA_192 } from "@/lib/omaggio";

/**
 * La pagina personale si può mettere sulla schermata Home (Luka, 6 ott):
 * diventa un'icona PAPI-ON OPENING col nome MALDITA, si apre
 * a tutto schermo e riparte sempre dalla SUA pagina — per questo il
 * manifest è uno per ragazza, col suo token come indirizzo di partenza.
 *
 * Non finisce su Google: chi ha il link è lei.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const valido = /^[0-9a-f]{20}$/.test(token);
  return {
    title: "Il tuo ingresso · MALDITA",
    robots: { index: false, follow: false },
    manifest: valido ? `/maldita/${token}/manifest` : undefined,
    icons: {
      icon: ICONA_192,
      apple: ICONA_180,
    },
    appleWebApp: {
      title: "MALDITA",
      capable: true,
      statusBarStyle: "black-translucent",
    },
  };
}

export default function MiaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
