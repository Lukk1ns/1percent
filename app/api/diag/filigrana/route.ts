import sharp from "sharp";

/**
 * Diagnostica temporanea: il server sa disegnare del testo?
 *
 * Sul computer di casa i font ci sono tutti, sul server di Vercel no:
 * se librsvg non trova nessun font, il testo dentro un SVG non viene
 * disegnato e non dà nessun errore — l'immagine esce identica.
 *
 * Questa rotta compone un po' di testo su un rettangolo e dice quanti
 * pixel si sono accesi. Zero = nessun font, ed è la spiegazione della
 * filigrana invisibile. Non tocca nessun dato: si può chiamare senza
 * essere loggati. Da togliere appena capito.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function prova(font: string) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120">
      <text x="10" y="80" font-family="${font}" font-size="64" font-weight="bold" fill="#ffffff">Prova 123</text>
    </svg>`,
  );
}

export async function GET(req: Request) {
  const famiglie = ["Helvetica, Arial, sans-serif", "sans-serif", "DejaVu Sans", "Liberation Sans"];
  const esiti: Record<string, number> = {};

  for (const f of famiglie) {
    try {
      const out = await sharp({
        create: { width: 400, height: 120, channels: 3, background: "#000000" },
      })
        .composite([{ input: prova(f), top: 0, left: 0 }])
        .raw()
        .toBuffer();
      // Conto i pixel non neri: se il testo è stato disegnato, ce ne sono
      let accesi = 0;
      for (let i = 0; i < out.length; i += 3) if (out[i] > 40) accesi++;
      esiti[f] = accesi;
    } catch (e) {
      esiti[f] = -1;
      esiti[`${f} — errore`] = 0;
      console.error(f, e);
    }
  }

  // Anche il motivo ripetuto: potrebbe non piacergli quello, non i font
  let pattern = -1;
  try {
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120">
        <defs><pattern id="p" width="120" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <rect x="0" y="0" width="60" height="30" fill="#ffffff"/>
        </pattern></defs>
        <rect width="400" height="120" fill="url(#p)"/>
      </svg>`,
    );
    const out = await sharp({
      create: { width: 400, height: 120, channels: 3, background: "#000000" },
    })
      .composite([{ input: svg, top: 0, left: 0 }])
      .raw()
      .toBuffer();
    let accesi = 0;
    for (let i = 0; i < out.length; i += 3) if (out[i] > 40) accesi++;
    pattern = accesi;
  } catch {
    pattern = -1;
  }

  const vuoi = new URL(req.url).searchParams.get("png");
  if (vuoi) {
    const png = await sharp({
      create: { width: 400, height: 120, channels: 3, background: "#000000" },
    })
      .composite([{ input: prova("sans-serif"), top: 0, left: 0 }])
      .png()
      .toBuffer();
    return new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  }

  return Response.json(
    { pixel_accesi_per_font: esiti, pattern_di_rettangoli: pattern, sharp: sharp.versions },
    { headers: { "Cache-Control": "no-store" } },
  );
}
