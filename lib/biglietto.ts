/**
 * La grafica del biglietto.
 *
 * È l'immagine che il cliente riceve su WhatsApp, con il QR appoggiato
 * sopra. Sta in un deposito **pubblico**, diverso da quello delle
 * locandine: la locandina nitida è riservata ai membri e prima dello
 * svelamento resta nascosta, mentre questa finisce in mano a centinaia
 * di persone che non sono iscritte a niente.
 *
 * Tenerle separate vuol dire che Luka sceglie cosa mettere sul biglietto
 * senza toccare la locandina segreta dell'evento.
 */

export const BUCKET_BIGLIETTI = "biglietti";

/** Formato storia, come le locandine: quello che esce da Canva o da Instagram. */
export const BIGLIETTO_W = 1080;
export const BIGLIETTO_H = 1920;

/** Dove finisce il file di un evento. */
export function graficaBigliettoPath(eventId: string): string {
  return `${eventId}/biglietto.webp`;
}

/** URL pubblico. `v` è il momento del caricamento: impedisce al telefono di tenersi la vecchia. */
export function graficaBigliettoUrl(key: string, v?: number | null): string {
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_BIGLIETTI}/${key}`;
  return v ? `${base}?v=${v}` : base;
}
