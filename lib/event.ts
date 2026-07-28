export const EVENT_NAME = "1%";
export const EVENT_PAYOFF = "not for everyone";
export const EVENT_DATE = new Date("2026-07-08T21:30:00+02:00");
// Fine serata: fino a quest'ora la home mostra "APERTI" al posto del countdown
export const EVENT_END = new Date("2026-07-09T01:00:00+02:00");
export const VENUE_NAME = "Papi on the Beach";
export const VENUE_CITY = "Roveredo in Piano (PN)";

// Interruttore master delle iscrizioni. false = "ISCRIZIONI CHIUSE AL MOMENTO"
// su tutto il sito, senza dipendere dall'RPC signups_open del DB.
//
// Riaperto il 28 lug: le iscrizioni servono per provare il flusso nuovo
// (candidatura staff compresa) sul ramo `organizzazione`.
// Allo step 2 questo interruttore sparisce: apertura e chiusura seguiranno
// i singoli eventi, non una serata sola scritta nel codice.
export const SIGNUPS_OPEN = true;
