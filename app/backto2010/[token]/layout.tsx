import type { Metadata } from "next";
import { ICONA_2010_180, ICONA_2010_192 } from "@/lib/omaggio";

/**
 * La pagina personale si mette sulla schermata Home come per MALDITA:
 * icona BACK TO 2010, si apre a tutto schermo e riparte sempre dalla
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
    title: "Il tuo shot · BACK TO 2010",
    robots: { index: false, follow: false },
    manifest: valido ? `/backto2010/${token}/manifest` : undefined,
    icons: {
      icon: ICONA_2010_192,
      apple: ICONA_2010_180,
    },
    appleWebApp: {
      title: "BACK TO 2010",
      capable: true,
      statusBarStyle: "black-translucent",
    },
  };
}

export default function MioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
