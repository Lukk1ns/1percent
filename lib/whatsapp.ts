/**
 * Il numero WhatsApp dei PR (6 ott).
 *
 * Luka: prima ogni PR lo attivava lui, a mano, e quindi con ognuno aveva
 * già una chat aperta su WhatsApp. Con le candidature dal sito questa
 * chat non c'era più: poteva esserci un PR che non sapeva come chiamare.
 * Ora il numero lo lascia chi si candida, e chi era già PR lo scrive la
 * prima volta che apre "Le tue prevendite". Il benvenuto parte da qui.
 *
 * La stessa regola sta nel database (`_numero_whatsapp`, script 41):
 * se si cambia una, va cambiata anche l'altra.
 */

/**
 * Il numero com'è salvato: "+" e solo cifre, col prefisso del paese.
 * Un cellulare italiano scritto "347 123 4567" diventa "+393471234567".
 * Un numero che comincia con 0 senza prefisso non si indovina (fisso
 * italiano? cellulare croato?): null, e si chiede il prefisso.
 */
export function normalizzaNumero(grezzo: string | null | undefined): string | null {
  if (!grezzo) return null;
  const n = grezzo.replace(/[^\d+]/g, "");
  let cifre: string;
  if (n.startsWith("+")) cifre = n.slice(1).replace(/\+/g, "");
  else if (n.startsWith("00")) cifre = n.slice(2);
  else if (n.startsWith("3") && (n.length === 9 || n.length === 10)) cifre = "39" + n;
  else if (n.startsWith("0")) return null;
  else cifre = n;
  if (!/^\d{10,15}$/.test(cifre)) return null;
  return "+" + cifre;
}

/** Leggibile a occhio: "+39 347 123 4567". Gli esteri restano come sono. */
export function mostraNumero(numero: string | null | undefined): string {
  if (!numero) return "";
  const m = numero.match(/^\+39(\d{3})(\d{3})(\d+)$/);
  return m ? `+39 ${m[1]} ${m[2]} ${m[3]}` : numero;
}

/** Apre WhatsApp sulla chat di quel numero, col messaggio già scritto. */
export function apriWhatsapp(numero: string, testo?: string) {
  const cifre = numero.replace(/\D/g, "");
  const url = `https://wa.me/${cifre}` + (testo ? `?text=${encodeURIComponent(testo)}` : "");
  window.open(url, "_blank");
}

/**
 * Il benvenuto che Luka manda al PR approvato, dal suo WhatsApp.
 * Vale anche per chi era già PR: non dice "da oggi", dice come funziona.
 * WhatsApp lo apre già scritto, quindi prima di mandarlo si può ritoccare.
 *
 * `emailAMano`: il PR l'ha aggiunto Luka dal pannello (7 ott), quindi
 * non si è mai iscritto e non sa con che mail entrare: glielo si dice,
 * col link che lo porta dritto alle sue prevendite.
 */
export function messaggioBenvenutoPR(
  nome: string,
  serate: string | null,
  emailAMano?: string | null,
): string {
  const base = typeof window === "undefined" ? "https://www.unpercento.it" : window.location.origin;
  const sito = `${base}/pr`;
  const entra = emailAMano
    ? `COME ENTRI (una volta sola)\n` +
      `Ti ho registrato io, non devi iscriverti. Apri ${base}/login?next=/pr e scrivi questa mail: ${emailAMano}\n` +
      `Ti arriva un codice di 6 cifre (se non lo vedi guarda in spam): scrivilo e sei dentro, su "Le tue prevendite".\n\n`
    : "";
  return (
    `Ciao ${nome}! Sono Luka dell'1% 👋\n` +
    `Sei PR${serate ? ` per ${serate}` : ""}: da adesso puoi vendere le prevendite dal sito.\n\n` +
    `Salvati questo numero: per serate, prevendite e soldi ci sentiamo qui.\n\n` +
    entra +
    `COME FUNZIONA\n` +
    (emailAMano
      ? `1. Le prevendite le fai da ${sito} (è "Le tue prevendite" in home). Se il sito non ti riconosce, tocca "Rientra" e usa ${emailAMano}.\n`
      : `1. Apri ${sito} (è "Le tue prevendite" in home). Se il sito non ti riconosce, tocca "Rientra" e usa la mail con cui ti sei iscritto.\n`) +
    `2. Prima di fare una prevendita ritira i soldi. Poi scrivi nome, cognome e anno di nascita del cliente.\n` +
    `3. Subito dopo trovi il tasto per mandargli il biglietto su WhatsApp. All'ingresso lo fa scansionare, con un documento vero in mano.\n` +
    `4. I soldi li consegni prima dell'evento, quando ti verrà indicato: finché non li consegni le prevendite non sono valide. La prevendita non è rimborsabile, ma si può cedere a un altro.\n` +
    `5. Ogni prevendita ti dà punti e stelle: le vedi in cima alla pagina.\n\n` +
    `Per qualsiasi dubbio scrivimi qui.`
  );
}
