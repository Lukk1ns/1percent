/**
 * I PR DEL PAPI-ON (17 nov 2026, script 61).
 *
 * Un gruppo a sé, fisso, con regole sue: non sono i PR dell'1% (quelli
 * delle prevendite, `/pr`). Ognuno ha un'app personale a un link
 * segreto (`/papion/pr/<link>`): chi ha il link è lui, niente mail né
 * codici. Il QR dell'app (PPR-…) è un'altra cosa: si mostra in cassa
 * (entra gratis, presenza, drink caricato) e al bar (drink, shot ogni
 * 5 presenze, 1 € di sconto su un drink alla volta).
 *
 * Le regole stanno anche nel database: se ne cambi una, cambiala lì.
 */

/** Ogni quante presenze c'è lo shot (= `_papion_ogni()` nello script 61). */
export const OGNI = 5;
/** Lo sconto al bar: un euro, sui drink da 7 € in su, uno alla volta. */
export const SCONTO_EURO = 1;
export const SCONTO_DA = 7;

/** Il QR del PR: lo scanner lo riconosce da qui, prima di chiamare il database. */
export const QR_PAPION = /^PPR-[0-9a-f]{20}$/;
/** Il link della sua app. */
export const LINK_PAPION = /^[0-9a-f]{24}$/;

export const ICONA_PPR_180 = "/papion/pr/icona-180.png";
export const ICONA_PPR_192 = "/papion/pr/icona-192.png";
export const ICONA_PPR_512 = "/papion/pr/icona-512.png";
export const LOGO_PAPION = "/papion/pr/logo-papion.svg";
export const ROSSO_PAPION = "#E90A11";

export type Stasera = {
  entrato_at: string;
  numero: number;
  shot: boolean;
  drink_at: string | null;
  shot_at: string | null;
};

export type TavoloPR = {
  id: string;
  serata: string;
  nome: string;
  budget: number | null;
  bottiglie: string | null;
  stato: "segnato" | "venuto" | "non_venuto";
};

export type AppPR = {
  id: string;
  nome: string;
  cognome: string;
  foto: string | null;
  qr: string;
  prevendite_1p: boolean;
  dal: string;
  ogni: number;
  serata: string;
  presenze: number;
  drink: number;
  shot: number;
  sconti: number;
  sconti_stasera: number;
  stasera: Stasera | null;
  storico: { serata: string; numero: number; shot: boolean; drink: boolean; shot_preso: boolean }[];
  tavoli: TavoloPR[];
  tavoli_tot: number;
};

/** L'indirizzo dell'app di un PR. */
export function urlApp(link: string): string {
  const base = typeof window === "undefined" ? "https://www.unpercento.it" : window.location.origin;
  return `${base}/papion/pr/${link}`;
}

/** La foto passa dal sito, che la chiede firmata a R2 (deposito privato). */
export function fotoUrl(key: string | null | undefined): string | null {
  return key ? `/api/papion-pr/foto?k=${encodeURIComponent(key)}` : null;
}

/** Le iniziali, quando la foto non c'è. */
export function iniziali(nome: string, cognome?: string | null): string {
  return ((nome?.[0] ?? "") + (cognome?.[0] ?? "")).toUpperCase() || "PR";
}

/** "2026-11-20" → una data vera, a mezzogiorno (niente scherzi di fuso). */
export function giorno(serata: string): Date {
  const [a, m, g] = serata.split("-").map(Number);
  return new Date(a, m - 1, g, 12);
}

/** "2026-11-20" → "ven 20 nov" */
export function dataCorta(serata: string): string {
  return giorno(serata).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}

/** "2026-11-20" → "venerdì 20 novembre" */
export function dataLunga(serata: string): string {
  return giorno(serata).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

/** Una data in "YYYY-MM-DD" senza passare dall'UTC. */
export function isoGiorno(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const g = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${g}`;
}

/**
 * Le prossime serate per segnare un tavolo: stasera e i prossimi
 * venerdì e sabato (le sere del PAPI-ON). Le altre si scelgono dal
 * calendario.
 */
export function prossimeSerate(serata: string, quante = 6): string[] {
  const out: string[] = [serata];
  const d = giorno(serata);
  for (let i = 1; out.length < quante && i < 40; i++) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i, 12);
    if (x.getDay() === 5 || x.getDay() === 6) out.push(isoGiorno(x));
  }
  return out;
}

/** "00:12" nel fuso di Roma. */
export function ora(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
}

/**
 * La tessera: quanti bollini sono pieni (0–5) e quante presenze mancano
 * allo shot. Alla 5ª presenza la tessera è piena: lo shot è di quella sera.
 */
export function bollini(presenze: number, ogni = OGNI): { pieni: number; mancano: number } {
  const giro = presenze % ogni;
  if (presenze > 0 && giro === 0) return { pieni: ogni, mancano: 0 };
  return { pieni: giro, mancano: ogni - giro };
}

/**
 * Il messaggio che Luka manda al PR dal suo WhatsApp: link + come si
 * mette sulla schermata Home + le regole. WhatsApp lo apre già scritto,
 * quindi prima di mandarlo si può ritoccare.
 */
export function messaggioBenvenutoPapion(nome: string, link: string): string {
  return (
    `Ciao ${nome}! Sono Luka 👋\n` +
    `Sei nei PR del PAPI-ON: questa è la tua app personale 👇\n` +
    `${urlApp(link)}\n\n` +
    `📲 PRIMA COSA: mettila sulla schermata Home\n` +
    `· iPhone: aprila con Safari → tasto Condividi (il quadrato con la freccia) → «Aggiungi alla schermata Home»\n` +
    `· Android: aprila con Chrome → ⋮ in alto a destra → «Aggiungi a schermata Home» (o «Installa app»)\n` +
    `Da lì la apri dall'icona PAPI-ON e sei sempre dentro, senza password.\n\n` +
    `COME FUNZIONA\n` +
    `1. Ogni sera in cassa fai scansionare il tuo QR: entri gratis e ti si carica il drink omaggio 🍸\n` +
    `2. Al bar fai scansionare lo stesso QR e hai il drink. Ogni ${OGNI} presenze anche lo shot omaggio 🥃\n` +
    `3. Sui drink che paghi (da ${SCONTO_DA} € in su): prima dello scontrino fai scansionare il QR e paghi ${SCONTO_EURO} € in meno. Un drink alla volta.\n` +
    `4. I tavoli che porti tu li segni dall'app.\n\n` +
    `Il link è solo tuo: non girarlo a nessuno.`
  );
}
