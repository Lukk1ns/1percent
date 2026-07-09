export const EVENT_NAME = "1%";
export const EVENT_PAYOFF = "not for everyone";
export const EVENT_DATE = new Date("2026-07-08T21:30:00+02:00");
// Fine serata: fino a quest'ora la home mostra "APERTI" al posto del countdown
export const EVENT_END = new Date("2026-07-09T01:00:00+02:00");
export const VENUE_NAME = "Papi on the Beach";
export const VENUE_CITY = "Roveredo in Piano (PN)";

// Interruttore master delle iscrizioni. false = "ISCRIZIONI CHIUSE AL MOMENTO"
// su tutto il sito, senza dipendere dall'RPC signups_open del DB.
// Il mercoledì 1% è sospeso; il sito resta online per il resto.
// Per riaprire una serata futura: rimettere true (+ aggiornare EVENT_DATE/EVENT_END).
export const SIGNUPS_OPEN = false;
