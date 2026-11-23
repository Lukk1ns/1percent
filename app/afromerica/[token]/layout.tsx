import type { Metadata } from "next";
import { ICONA_AF_180, ICONA_AF_192 } from "@/lib/omaggio";

/**
 * La pagina personale si mette sulla schermata Home come per MALDITA:
 * icona AFRO-MERICA, si apre a tutto schermo e riparte sempre dalla
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
    title: "Ladies free · AFRO-MERICA",
    robots: { index: false, follow: false },
    manifest: valido ? `/afromerica/${token}/manifest` : undefined,
    icons: {
      icon: ICONA_AF_192,
      apple: ICONA_AF_180,
    },
    appleWebApp: {
      title: "AFRO-MERICA",
      capable: true,
      statusBarStyle: "black-translucent",
    },
  };
}

export default function MioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
