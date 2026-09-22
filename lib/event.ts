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

/**
 * Lo STAND: il banchetto che mettiamo dentro il locale a ogni serata.
 *
 * Non è la porta. All'ingresso si entra normalmente, con i modi del
 * locale. Allo stand si va quando si vuole: si fa scansionare il QR,
 * parte l'estrazione e si ritira subito quello che si vince. Quella
 * stessa scansione vale come presenza alla serata — un solo scan.
 *
 * Ci passano tutti, clienti e PR: anche chi lavora gioca ogni serata.
 */
export const STAND_NAME = "stand UNPERCENTO";
export const STAND_DOVE = "dentro il locale";
export const STAND_FRASE =
  "Allo stand UNPERCENTO, dentro il locale, fai scansionare il tuo QR: l'estrazione parte lì e il regalo lo ritiri sul momento.";
export const STAND_NON_INGRESSO =
  "Non c'entra con l'ingresso: in discoteca entri come sempre. Lo stand è nostro, e si gioca a ogni serata.";

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

/**
 * Si entra SOLO col link di qualcuno.
 *
 * true  = chi arriva su /unisciti senza `?ref=` viene fermato, e la home
 *         non mostra il bottone d'iscrizione ma "si entra su invito".
 * false = porta aperta a chiunque (com'era prima).
 *
 * Serve per le prime ore: Luka manda il suo link nel gruppo e tutti
 * entrano sotto di lui, poi si apre a tutti quando si svela l'ospite.
 *
 * ⚠️ È una porta, non una cassaforte: il controllo sta nel browser,
 * quindi uno che sa cosa fa può inventarsi un `?ref=` qualunque ed
 * entrare lo stesso (finirebbe senza chi l'ha portato). Per bloccarlo
 * davvero servirebbe la regola dentro `join_public` sul server. Per
 * tenere in riga un gruppo di promoter va benissimo così.
 */
export const SOLO_SU_INVITO = true;

/**
 * Per adesso si entra solo come staff.
 *
 * true  = chi sceglie "Vengo alle serate" viene fermato con "sicuro come
 *         cliente?" e non può proseguire. Serve nei giorni in cui si sta
 *         reclutando la crew e un PR che si iscrive come cliente è un
 *         PR perso.
 * false = tutti e due i percorsi aperti, com'era.
 */
export const SOLO_STAFF = true;

/**
 * La chiave che deve esserci nel link d'invito, oltre al `?ref=`.
 *
 * Senza, per entrare bastava che nell'indirizzo ci fosse un `?ref=`
 * qualunque: chi vedeva il link di un amico si scriveva `?ref=pippo` ed
 * era dentro. Con la chiave il link non si inventa — si può solo
 * ricevere da chi ce l'ha.
 *
 * Non è un segreto da cassaforte (chi ha il link ce l'ha e può girarlo):
 * serve a impedire che ci si entri per conto proprio. Per bloccare anche
 * l'inoltro servono i codici monouso, che sono un altro discorso.
 *
 * Si cambia da qui: cambiarla invalida tutti i link già in giro.
 */
export const CHIAVE_INVITO = "pn935ad9c1";

/**
 * Il modulo per chi ha meno di 16 anni compiuti, quando la serata non
 * ne ha uno suo.
 *
 * Ogni serata può avere il proprio (`events.delega_url`, si sceglie dal
 * pannello) perché i due locali sono due società diverse e hanno due
 * informative privacy diverse. Questo è il ripiego, usato solo se per
 * quella serata non è stato scelto niente.
 *
 * I file stanno in `public/moduli/`; i sorgenti da cui si rigenerano
 * sono in ClaudeLukkins/STAGIONE_INVERNALE_2026-27/PDF/.
 */
export const DELEGA_UNDER16_URL = "/moduli/delega-pr1me.pdf";

/**
 * Le foto aprono la porta.
 *
 * Il resto del sito è ancora su invito e accetta solo candidature staff
 * (SOLO_SU_INVITO e SOLO_STAFF qui sopra), impostazioni nate quando si
 * reclutavano i PR. Ma la galleria serve proprio a far entrare gente
 * nuova: chi arriva da un album e vuole vedere le foto della serata in
 * cui c'era deve potersi iscrivere come cliente, subito.
 *
 * Con questa accesa, chi atterra su /unisciti arrivando da /foto passa
 * senza link d'invito e senza doversi candidare. Chi arriva da
 * qualunque altra parte trova le regole di prima.
 *
 * Spegnila se un giorno vuoi che anche le foto siano solo per invitati.
 */
export const FOTO_APRONO_LA_PORTA = true;
