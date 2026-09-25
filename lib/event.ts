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
  "È il tuo ticket per l'estrazione premi: vieni alla serata, fallo scansionare allo stand UNPERCENTO e scopri subito cosa hai vinto. Drink, shot, magliette e anche la foto con l'ospite: il premio lo ritiri sul momento.";
export const STAND_NON_INGRESSO =
  "Non è il biglietto d'ingresso: in discoteca entri come sempre. Il ticket vale una giocata a ogni serata.";

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
 * ⚠️ È una porta, non una cassaforte: il controllo sta nel browser,
 * quindi uno che sa cosa fa può inventarsi un `?ref=` qualunque ed
 * entrare lo stesso (finirebbe senza chi l'ha portato). Per bloccarlo
 * davvero servirebbe la regola dentro `join_public` sul server.
 *
 * SPENTA il 24 settembre 2026, deciso da Luka: "il sito adesso può
 * essere aperto a chiunque, non serve più la storia dell'invito, più
 * utenti facciamo meglio è". L'invito era nato per reclutare i PR a
 * agosto; adesso la galleria porta gente da fuori e fermarla sulla
 * soglia era un iscritto buttato via. I link con `?ref=` continuano a
 * funzionare e a segnare chi ha portato chi: quello non si tocca.
 */
export const SOLO_SU_INVITO = false;

/**
 * Per adesso si entra solo come staff.
 *
 * true  = chi sceglie "Vengo alle serate" viene fermato con "sicuro come
 *         cliente?" e non può proseguire. Serve nei giorni in cui si sta
 *         reclutando la crew e un PR che si iscrive come cliente è un
 *         PR perso.
 * false = tutti e due i percorsi aperti.
 *
 * SPENTA il 24 settembre 2026 insieme all'invito. Attenzione a cosa NON
 * cambia: chi sceglie "iscrizione come staff" fa le sue 6 domande e
 * resta `in_attesa` finché Luka non lo approva da /admin/crew. Nessuno
 * diventa PR da solo — quella è una regola del database, non di qui.
 */
export const SOLO_STAFF = false;

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
 * I moduli dei due locali, per scegliere quello giusto quando la serata
 * non ha ancora il suo (`events.delega_url`, scheda Grafica del pannello).
 *
 * Il modulo sbagliato non è un dettaglio: dentro c'è l'informativa
 * privacy, e nomina la società che tratta i dati del ragazzo. PAPI ON
 * THE BEACH è QFB SRL, PR1ME CLUB è EXO SRLS.
 */
const DELEGHE: Array<{ indizio: string; url: string }> = [
  { indizio: "pr1me", url: "/moduli/delega-pr1me.pdf" },
  { indizio: "prime", url: "/moduli/delega-pr1me.pdf" },
  { indizio: "papi", url: "/moduli/delega-papion.pdf" },
];

/** Il modulo del locale dove si va, riconosciuto dal nome. */
export function delegaPerLocale(locale: string | null | undefined): string {
  const n = (locale ?? "").toLowerCase();
  return DELEGHE.find((d) => n.includes(d.indizio))?.url ?? DELEGA_UNDER16_URL;
}

/**
 * "Questo qui, la sera della serata, potrebbe avere meno di 16 anni?"
 *
 * Del cliente il PR scrive solo l'ANNO di nascita, non il giorno: chi è
 * nato nel 2010 può aver già compiuto 16 anni o compierli a dicembre, e
 * da qui non si vede. Quindi si sbaglia dalla parte giusta e la delega
 * si nomina a tutti i nati dall'anno di confine in poi — a chi i 16 li
 * ha già compiuti non costa niente, il messaggio dice "SE hai meno di
 * 16 anni". È la stessa regola di `forse_under16` nel database.
 */
export function forseUnder16(anno: number | null | undefined, quando?: string | null): boolean {
  if (!anno) return false;
  const rif = quando ? new Date(quando) : new Date();
  const annoSerata = Number.isNaN(rif.getTime()) ? new Date().getFullYear() : rif.getFullYear();
  return anno >= annoSerata - 16;
}

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
