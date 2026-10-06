/**
 * DONNA OMAGGIO — la pagina dedicata di MALDITA (sabato 17 ottobre 2026).
 *
 * Il database (script 42) decide tutto: posti, approvazioni, scadenza
 * delle 00:30. Qui ci sono solo le parole e le cose che servono a più
 * pagine: la pagina pubblica, la pagina della ragazza e il pannello.
 */

export const SLUG_MALDITA = "maldita";

export const LOCANDINA_WEB = "/maldita/locandina.webp";
/** Il file da scaricare per la storia: nome leggibile, qualità piena. */
export const LOCANDINA_STORIA = "/maldita/locandina-maldita-papion.jpg";

export const INDIRIZZO_PAPION = "Via XX Settembre 289 · Roveredo in Piano (PN)";

export type StatoRichiesta = "in_attesa" | "lista_attesa" | "approvata" | "rifiutata";

/** Cosa risponde `omaggio_iscrivi`, detto a una ragazza. */
export const ERRORI_ISCRIZIONE: Record<string, string> = {
  chiusa: "Le prenotazioni sono chiuse.",
  sconosciuta: "Questa lista non esiste più.",
  privacy: "Per prenotare devi accettare l'informativa qui sotto.",
  nome_sbagliato: "Controlla nome e cognome: solo lettere, come sul documento.",
  numero_sbagliato:
    "Il numero WhatsApp non va. Scrivilo intero; se non è italiano mettici davanti il prefisso (es. +385…).",
  data_sbagliata: "Controlla l'anno di nascita.",
  troppo_giovane: "L'ingresso omaggio è dai 16 anni in su.",
  instagram_sbagliato: "Il nome Instagram non va: solo lettere, numeri, punti e trattini bassi.",
  gia_registrata: "Risulti già prenotata con un altro numero: vale una prenotazione a testa.",
  numero_usato: "Questo numero è già stato usato da un'altra persona.",
  troppe: "Troppe prenotazioni dalla stessa rete. Riprova fra un'ora o da un'altra connessione.",
};

/** Il link della pagina personale, da mandare su WhatsApp. */
export function linkPersonale(token: string): string {
  const base =
    typeof window === "undefined" ? "https://www.unpercento.it" : window.location.origin;
  return `${base}/${SLUG_MALDITA}/${token}`;
}

/** Riempie {nome}, {link}, {tag} nei testi scritti da Luka. */
export function riempi(
  testo: string,
  dati: { nome?: string; link?: string; tag?: string | null },
): string {
  return testo
    .replaceAll("{nome}", dati.nome ?? "")
    .replaceAll("{link}", dati.link ?? "")
    .replaceAll("{tag}", dati.tag || "il PAPI-ON");
}

/** "00:30" — l'ora nel fuso di Roma, qualunque sia quello del telefono. */
export function oraRoma(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
}

/** "venerdì 16 ottobre alle 23:59" */
export function giornoOraRoma(iso: string): string {
  const d = new Date(iso);
  const giorno = d.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Rome",
  });
  return `${giorno} alle ${oraRoma(iso)}`;
}
