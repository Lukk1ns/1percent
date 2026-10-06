/**
 * Il manifest della "app" di una ragazza: parte sempre dalla sua pagina.
 * Serve ad Android per offrire "Installa" e a tutti per nome e icona.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{20}$/.test(token)) {
    return new Response("Non trovato", { status: 404 });
  }

  const manifest = {
    name: "MALDITA · il mio ingresso",
    short_name: "MALDITA",
    description: "Il tuo ingresso omaggio per sabato 17 ottobre al PAPI-ON",
    id: `/maldita/${token}`,
    start_url: `/maldita/${token}`,
    scope: "/maldita/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/maldita/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/maldita/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
