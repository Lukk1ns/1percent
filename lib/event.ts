/**
 * Identità del marchio.
 *
 * 1% non è più una serata: è il nome dell'organizzazione che fa le feste.
 * Qui dentro ci va SOLO quello che vale per tutti gli eventi. Le singole
 * feste (nome, data, locale) stanno nel database, tabella `events`.
 */

export const BRAND_NAME = "1%";
export const BRAND_PAYOFF = "not for everyone";

/**
 * La riga sotto il wordmark in homepage.
 * È in un punto solo apposta: cambiala qui e cambia dappertutto.
 */
export const BRAND_CLAIM = "Pordenone eventi";

/** La zona in cui operiamo, per firme e footer. */
export const BRAND_AREA = "Pordenone e dintorni";

/** Titolare del trattamento dati (privacy policy). */
export const LEGAL_NAME = "Papi on the Beach";

/**
 * Interruttore master delle iscrizioni.
 * false = "ISCRIZIONI CHIUSE AL MOMENTO" su tutto il sito.
 *
 * Resta come freno d'emergenza generale. La regola normale ormai è
 * un'altra: le iscrizioni sono sempre aperte, perché il portale non
 * serve più una serata sola ma tutti gli eventi.
 */
export const SIGNUPS_OPEN = true;
