/**
 * La locandina di un evento.
 *
 * Formato di riferimento: la storia di Instagram, 1080x1920. Quello che
 * carichi non viene tagliato: se non è 9:16 ci sta dentro intero, con le
 * fasce laterali riempite dalla stessa immagine sfocata.
 *
 * Due versioni, come per i volti: la nitida sta in un deposito privato e
 * la vedono solo i membri; la sfocata è pubblica ed è generata dal server
 * a 180px prima di essere sfocata — i pixel della nitida non ci sono più,
 * quindi non è un filtro da togliere.
 */

export const LOCANDINA_W = 1080;
export const LOCANDINA_H = 1920;

/** Larghezza della versione sfocata: piccola per davvero. */
export const LOCANDINA_BLUR_W = 180;
export const LOCANDINA_BLUR_SIGMA = 6;

export const BUCKET_NITIDA = "locandine";
export const BUCKET_SFOCATA = "locandine-blur";

/** Dove finisce il file di un evento, in entrambi i depositi. */
export function locandinaPath(eventId: string): string {
  return `${eventId}/locandina.webp`;
}

/** URL pubblico della sfocata. `v` è il momento del caricamento: rompe la cache. */
export function locandinaSfocataUrl(key: string, v?: number | null): string {
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_SFOCATA}/${key}`;
  return v ? `${base}?v=${v}` : base;
}


/**
 * La firma ripetuta in diagonale su tutta la locandina.
 *
 * È un motivo che si ripete (`<pattern>`), non righe disegnate a mano:
 * così copre l'immagine intera e **anche un ritaglio dello screenshot
 * contiene almeno una firma leggibile**. Contorno scuro sotto e
 * riempimento chiaro sopra, così si legge sia sulle zone nere sia su
 * quelle bruciate dalle luci.
 */
export function filigranaSvg(w: number, h: number, testo: string): Buffer {
  const dim = Math.round(w / 30);
  // Larghezza stimata del testo in Helvetica bold: circa 0,58 em a carattere
  const largh = Math.round(testo.length * dim * 0.58);
  const tw = largh + Math.round(dim * 4);
  const th = Math.round(dim * 5.5);
  const esc = testo.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const stile =
    `font-family="Helvetica, Arial, sans-serif" font-size="${dim}" font-weight="bold" ` +
    `fill="rgba(255,255,255,0.20)" stroke="rgba(0,0,0,0.30)" ` +
    `stroke-width="${Math.max(1, dim / 20)}" paint-order="stroke"`;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <pattern id="f" width="${tw}" height="${th}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <text x="0" y="${Math.round(th * 0.45)}" ${stile}>${esc}</text>
      <text x="${Math.round(tw / 2)}" y="${Math.round(th * 0.95)}" ${stile}>${esc}</text>
    </pattern>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#f)"/>
</svg>`);
}
