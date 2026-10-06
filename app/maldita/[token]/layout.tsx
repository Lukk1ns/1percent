import type { Metadata } from "next";

/**
 * La pagina personale si può mettere sulla schermata Home (Luka, 6 ott):
 * diventa un'icona con la faccia della serata e il nome MALDITA, si apre
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
      icon: "/maldita/icon-192.png",
      apple: "/maldita/apple-touch-icon.png",
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
