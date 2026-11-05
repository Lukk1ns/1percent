import type { Metadata } from "next";
import { ICONA_SL_180, ICONA_SL_192 } from "@/lib/omaggio";

/**
 * La pagina personale si mette sulla schermata Home come per MALDITA:
 * icona col 13/11 della locandina CULTURE, si apre a tutto schermo e riparte sempre dalla
 * SUA pagina — per questo il manifest è uno per persona.
 *
 * Non finisce su Google: chi ha il link è lui.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const valido = /^[0-9a-f]{20}$/.test(token);
  return {
    title: "Il tuo omaggio · CULTURE",
    robots: { index: false, follow: false },
    manifest: valido ? `/slings/${token}/manifest` : undefined,
    icons: {
      icon: ICONA_SL_192,
      apple: ICONA_SL_180,
    },
    appleWebApp: {
      title: "CULTURE",
      capable: true,
      statusBarStyle: "black-translucent",
    },
  };
}

export default function MioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
