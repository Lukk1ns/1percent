/**
 * I punti dei PR (30 settembre 2026).
 *
 * Luka: *"10 punti per ogni vendita fatta"*, in tempo reale, e cinque
 * stelle da conquistare. Le prime tre valgono 10 prevendite ciascuna,
 * la quarta 25 e la quinta 35.
 *
 * Il database conta soltanto le vendite (`pr_punti`, `admin_pr_punti`
 * in `supabase/38_punti_pr.sql`): valide, a pagamento, fatte da un PR.
 * Punti e stelle si calcolano qui, così per cambiare un gradino basta
 * questo file e non serve toccare il database.
 */

export const PUNTI_PER_VENDITA = 10;

/** Quante prevendite servono per ogni stella, una dopo l'altra. */
const VENDITE_PER_STELLA = [10, 10, 10, 25, 35];

/** Le stesse soglie in punti, una sopra l'altra: 100 · 200 · 300 · 550 · 900. */
export const SOGLIE_STELLE: number[] = VENDITE_PER_STELLA.reduce<number[]>((soglie, v) => {
  const prima = soglie.length ? soglie[soglie.length - 1] : 0;
  soglie.push(prima + v * PUNTI_PER_VENDITA);
  return soglie;
}, []);

export const ORDINALI = ["prima", "seconda", "terza", "quarta", "quinta"];

export type StatoStelle = {
  punti: number;
  /** Stelle già prese, da 0 a 5. */
  stelle: number;
  /** I punti che accendono la prossima stella; null se le ha tutte. */
  prossima: number | null;
  /** Quanto è piena la stella in corso, da 0 a 1. */
  quota: number;
  /** Prevendite che mancano alla prossima stella. */
  mancano: number;
};

export function statoStelle(vendite: number): StatoStelle {
  const punti = Math.max(0, vendite) * PUNTI_PER_VENDITA;
  const stelle = SOGLIE_STELLE.filter((s) => punti >= s).length;
  const da = stelle ? SOGLIE_STELLE[stelle - 1] : 0;
  const prossima = stelle < SOGLIE_STELLE.length ? SOGLIE_STELLE[stelle] : null;
  return {
    punti,
    stelle,
    prossima,
    quota: prossima === null ? 1 : (punti - da) / (prossima - da),
    mancano: prossima === null ? 0 : Math.ceil((prossima - punti) / PUNTI_PER_VENDITA),
  };
}

/** 1080 → "1.080": i punti si leggono all'italiana. */
export function fmtPunti(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
