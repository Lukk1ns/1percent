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
