import { ICONA_2010_192, ICONA_2010_512 } from "@/lib/omaggio";

/**
 * Il manifest della "app" di una persona: parte sempre dalla sua pagina.
 * Serve ad Android per offrire "Installa" e a tutti per nome e icona.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{20}$/.test(token)) {
    return new Response("Non trovato", { status: 404 });
  }

  const manifest = {
    name: "BACK TO 2010 · il mio shot",
    short_name: "BACK TO 2010",
    description: "Il tuo shot omaggio per venerdì 30 ottobre al PAPI-ON",
    id: `/backto2010/${token}`,
    start_url: `/backto2010/${token}`,
    scope: "/backto2010/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: ICONA_2010_192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: ICONA_2010_512, sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
