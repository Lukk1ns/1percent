/**
 * Il biglietto che parte verso il cliente: link, messaggio, chat.
 *
 * Stava solo nella pagina del PR. Dal 13 ott lo usa anche il pannello,
 * perché Luka deve poter rimandare il link a chi l'ha perso senza
 * chiederlo al PR: le due copie del messaggio non devono separarsi.
 */

/** Il link che finisce su WhatsApp: assoluto, perché esce dal sito. */
export function linkBiglietto(token: string): string {
  if (typeof window === "undefined") return `/biglietto/${token}`;
  return `${window.location.origin}/biglietto/${token}`;
}

export function linkAssoluto(percorso: string): string {
  if (typeof window === "undefined") return percorso;
  return `${window.location.origin}${percorso}`;
}

/**
 * Il numero del cliente come lo vuole WhatsApp: solo cifre, col prefisso.
 * Un cellulare italiano scritto "347 123 4567" diventa "393471234567".
 * Più largo di `normalizzaNumero`: il numero del cliente lo scrive il PR
 * di fretta e non passa da nessun controllo.
 */
export function numeroCliente(grezzo: string | null): string | null {
  if (!grezzo) return null;
  const conPiu = grezzo.trim().startsWith("+");
  // Via spazi, trattini, punti e parentesi: wa.me vuole solo cifre
  let n = grezzo.replace(/\D/g, "");
  if (!conPiu && n.startsWith("00")) n = n.slice(2);
  // Cellulare italiano senza prefisso (9-10 cifre); "39347…" ce l'ha già
  else if (!conPiu && n.startsWith("3") && n.length >= 9 && n.length <= 10) n = "39" + n;
  return n.length >= 10 ? n : null;
}

/**
 * Il messaggio col biglietto.
 *
 * Se il cliente potrebbe avere meno di 16 anni la sera della serata, il
 * modulo di delega ci finisce dentro da solo: chi lo manda non deve
 * ricordarsi di niente e il ragazzo se lo scarica subito, non la sera
 * stessa davanti alla porta.
 */
export function messaggioBiglietto(
  b: { nome: string; token: string },
  evento: string,
  quando: string,
  delega?: { serve: boolean; url: string },
): string {
  const base =
    `Ciao ${b.nome}! Ecco il tuo biglietto per ${evento} — ${quando}.\n\n` +
    `${linkBiglietto(b.token)}\n\n` +
    `Fallo scansionare all'ingresso, non serve stamparlo. ` +
    `Ricordati il documento fisico, non la foto sul telefono: serve a tutti.`;

  if (!delega?.serve) return base;

  return (
    base +
    `\n\n⚠️ SE HAI MENO DI 16 ANNI ti serve anche la delega firmata da un genitore. ` +
    `Scaricala qui, compilala e portala con te: senza quella non si entra.\n` +
    `${linkAssoluto(delega.url)}`
  );
}

/** Apre WhatsApp col messaggio già scritto: senza numero si sceglie la chat. */
export function apriChatCliente(numero: string | null, testo: string) {
  const base = numero ? `https://wa.me/${numero}` : "https://wa.me/";
  window.open(`${base}?text=${encodeURIComponent(testo)}`, "_blank");
}

/**
 * Copia un testo. Se il telefono non lo permette (pagina vecchia, permessi)
 * lo mostra in una finestrella da cui copiarlo a mano: mai un tasto che
 * sembra aver fatto qualcosa e invece niente.
 */
export async function copia(testo: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(testo);
    return true;
  } catch {
    window.prompt("Tieni premuto qui sotto e copia:", testo);
    return false;
  }
}

/** Per cercare senza badare a maiuscole e accenti: "nicolò" = "nicolo". */
function normalizza(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Filtra un elenco di biglietti: ogni parola scritta deve esserci, quindi
 * "mario rossi" e "rossi mario" trovano la stessa persona. Vuoto = tutti.
 */
export function cercaBiglietti<T>(lista: T[], cerca: string, dove: (b: T) => string): T[] {
  const parole = normalizza(cerca).split(/\s+/).filter(Boolean);
  if (parole.length === 0) return lista;
  return lista.filter((b) => {
    const testo = normalizza(dove(b));
    return parole.every((p) => testo.includes(p));
  });
}
