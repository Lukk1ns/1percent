import sharp from "sharp";
import { filigranaSvg } from "@/lib/locandina";

/**
 * Diagnostica temporanea: disegna la filigrana VERA su un rettangolo
 * finto e la restituisce come immagine, così si guarda con gli occhi
 * invece di indovinare. Nessun dato reale passa da qui.
 *
 * Da togliere appena la filigrana funziona.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const w = 1080;
  const h = 1920;

  // Finta locandina: fondo scuro, una zona rossa e una bianca, come una
  // grafica vera — serve a vedere se la firma si legge su tutte e tre
  const rosso = await sharp({
    create: { width: 700, height: 700, channels: 3, background: "#c8452e" },
  })
    .png()
    .toBuffer();
  const bianco = await sharp({
    create: { width: 900, height: 160, channels: 3, background: "#f2f2f2" },
  })
    .png()
    .toBuffer();

  const base = await sharp({
    create: { width: w, height: h, channels: 3, background: "#0d0d10" },
  })
    .composite([
      { input: rosso, top: 420, left: 190 },
      { input: bianco, top: 1350, left: 90 },
    ])
    .png()
    .toBuffer();

  const png = await sharp(base)
    .composite([{ input: filigranaSvg(w, h, "jamvulture · #0001"), top: 0, left: 0 }])
    .png()
    .toBuffer();

  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
