/**
 * La porta quando la rete non c'è.
 *
 * Prima della serata si scarica la lista dei biglietti e si tiene sul
 * telefono. Da lì in poi la porta lavora da sola: legge il QR, cerca
 * nella lista, decide e segna l'ingresso in locale. Appena torna la
 * rete, gli ingressi partono verso il server.
 *
 * Il limite, che va conosciuto: due telefoni offline non si parlano,
 * quindi lo stesso biglietto potrebbe passare due volte. Non è
 * evitabile — ma alla riconciliazione il server dice quali, con nome
 * e ora, e si va a vedere.
 *
 * I dati stanno in localStorage: per mille biglietti sono un centinaio
 * di kilobyte, e a differenza di IndexedDB non si rompe in niente.
 * Dentro ci sono nomi e cognomi, quindi c'è il bottone per cancellare
 * tutto a fine serata — e si cancella da sé dopo tre giorni.
 */

export type BigliettoLocale = {
  token: string;
  nome: string;
  cognome: string;
  tier_label: string;
  stato: "in_attesa" | "attiva" | "usata";
  under16: boolean;
  minorenne: boolean;
  pr_alias: string;
};

export type ScansioneOffline = { token: string; quando: string };

type Deposito = {
  eventId: string;
  nomeEvento: string;
  scaricata: string;
  biglietti: BigliettoLocale[];
  daMandare: ScansioneOffline[];
};

const CHIAVE = "porta_offline_v1";
const SCADENZA_GIORNI = 3;

function leggi(): Deposito | null {
  try {
    const raw = localStorage.getItem(CHIAVE);
    if (!raw) return null;
    const d = JSON.parse(raw) as Deposito;
    // una lista vecchia è peggio di nessuna lista
    const giorni = (Date.now() - new Date(d.scaricata).getTime()) / 86_400_000;
    if (giorni > SCADENZA_GIORNI) {
      localStorage.removeItem(CHIAVE);
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

function scrivi(d: Deposito) {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(d));
  } catch {
    // memoria piena: meglio saperlo subito che a metà serata
    throw new Error("Non c'è spazio sul telefono per la lista.");
  }
}

export function depositoAttuale(): Deposito | null {
  return leggi();
}

/** Mette da parte la lista scaricata dal server. */
export function salvaLista(
  eventId: string,
  nomeEvento: string,
  biglietti: BigliettoLocale[],
) {
  const vecchio = leggi();
  scrivi({
    eventId,
    nomeEvento,
    scaricata: new Date().toISOString(),
    biglietti,
    // se c'erano ingressi non ancora mandati, non si buttano
    daMandare: vecchio?.eventId === eventId ? vecchio.daMandare : [],
  });
}

export function svuota() {
  localStorage.removeItem(CHIAVE);
}

export type EsitoLocale =
  | "ok"
  | "gia_usato"
  | "non_pagato"
  | "sconosciuto"
  | "senza_lista";

/**
 * Valida un biglietto contro la lista sul telefono.
 * Segna subito l'ingresso in locale: il server lo saprà dopo.
 */
export function validaOffline(
  token: string,
): { esito: EsitoLocale; biglietto?: BigliettoLocale } {
  const d = leggi();
  if (!d) return { esito: "senza_lista" };

  const b = d.biglietti.find((x) => x.token === token);
  if (!b) return { esito: "sconosciuto" };

  if (b.stato === "usata") return { esito: "gia_usato", biglietto: b };

  const eraInAttesa = b.stato === "in_attesa";

  b.stato = "usata";
  d.daMandare.push({ token, quando: new Date().toISOString() });
  scrivi(d);

  return { esito: eraInAttesa ? "non_pagato" : "ok", biglietto: b };
}

/** Quanti ingressi aspettano di essere mandati al server. */
export function daMandare(): number {
  return leggi()?.daMandare.length ?? 0;
}

/** Quanti sono entrati secondo il telefono. */
export function contatoreLocale(): { entrati: number; totali: number } {
  const d = leggi();
  if (!d) return { entrati: 0, totali: 0 };
  return {
    entrati: d.biglietti.filter((b) => b.stato === "usata").length,
    totali: d.biglietti.filter((b) => b.stato !== "in_attesa").length,
  };
}

/** Cerca per nome dentro la lista locale. */
export function cercaOffline(testo: string): BigliettoLocale[] {
  const d = leggi();
  if (!d || testo.trim().length < 2) return [];
  const q = testo.trim().toLowerCase();
  return d.biglietti
    .filter((b) => `${b.nome} ${b.cognome}`.toLowerCase().includes(q))
    .slice(0, 25);
}

/** Svuota la coda dopo che il server l'ha presa in carico. */
export function segnaMandati(token: string[]) {
  const d = leggi();
  if (!d) return;
  d.daMandare = d.daMandare.filter((s) => !token.includes(s.token));
  scrivi(d);
}

/** La coda, per mandarla al server. */
export function codaDaMandare(): ScansioneOffline[] {
  return leggi()?.daMandare ?? [];
}
