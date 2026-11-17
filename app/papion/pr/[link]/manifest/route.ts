import { ICONA_PPR_192, ICONA_PPR_512, LINK_PAPION } from "@/lib/papion-pr";

/**
 * Il manifest dell'app di un PR: parte sempre dalla sua pagina.
 * Serve ad Android per offrire "Installa" e a tutti per nome e icona.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ link: string }> }) {
  const { link } = await params;
  if (!LINK_PAPION.test(link)) {
    return new Response("Non trovato", { status: 404 });
  }

  const manifest = {
    name: "PAPI-ON · PR",
    short_name: "PAPI-ON",
    description: "La tua app di PR del PAPI-ON Music Club",
    id: `/papion/pr/${link}`,
    start_url: `/papion/pr/${link}`,
    scope: "/papion/pr/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: ICONA_PPR_192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: ICONA_PPR_512, sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
