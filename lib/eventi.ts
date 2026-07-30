/**
 * Eventi e locali, lato sito.
 *
 * Il server decide cosa possiamo sapere: di un evento non ancora
 * svelato NON arriva il nome, né il locale, né l'indirizzo della sua
 * pagina. Arriva solo la data e il teaser. Quindi non c'è modo di
 * sbirciare aprendo il codice della pagina — il segreto non è mai
 * uscito da Postgres.
 */

export type EventoSvelato = {
  svelato: true;
  id: string;
  slug: string;
  nome: string;
  locale: string | null;
  citta: string | null;
  indirizzo: string | null;
  descrizione: string | null;
  cover_key: string | null;
  /** Quando è stata caricata la locandina: rompe la cache del browser. */
  cover_v?: number | null;
  starts_at: string;
  ends_at: string | null;
  passato: boolean;
};

export type EventoNascosto = {
  svelato: false;
  teaser: string | null;
  reveal_at: string;
  starts_at: string;
  ends_at: string | null;
  passato: false;
};

export type Evento = EventoSvelato | EventoNascosto;

/** Es. "sabato 12 settembre" */
export function dataLunga(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Es. "12 set" — per le liste strette */
export function dataCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

/** Es. "22:30" */
export function ora(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
