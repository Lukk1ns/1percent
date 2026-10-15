/**
 * Le persone del pannello "cerca" (15 ott): iscritti al sito, biglietti di
 * tutte le serate e liste omaggio, messi insieme per nome.
 *
 * La persona è il NOME (nome + cognome, anche girati), non il telefono:
 * un PR di fretta mette il suo numero su cinque biglietti di amici, e
 * unendo per numero diventerebbero una persona sola.
 */

import { normalizzaNumero } from "./whatsapp";

export type Iscritto = {
  id: string;
  alias: string;
  member_number: number;
  created_at: string;
  email: string | null;
  role?: string | null;
  crew_request_status?: string | null;
  nome?: string | null;
  invitato_da?: string | null;
};

export type Serata = {
  event_id: string;
  nome: string;
  locale: string | null;
  starts_at: string;
  passato: boolean;
};

export type Biglietto = {
  id: string;
  nome: string;
  cognome: string;
  anno_nascita: number;
  telefono: string | null;
  tier_label: string;
  prezzo: number;
  token: string;
  stato: string;
  under16: boolean;
  pr_alias: string;
  pr_nome: string | null;
  created_at: string;
  serata: Serata;
};

export type Richiesta = {
  id: string;
  nome: string;
  cognome: string;
  nascita: string | null;
  telefono: string | null;
  instagram: string | null;
  stato: string;
  token: string;
  created_at: string;
  conferma_at: string | null;
  shot_at: string | null;
  entrata_at: string | null;
  lista: string;
};

export type Persona = {
  chiave: string;
  nome: string;
  anno: number | null;
  telefoni: string[];
  biglietti: Biglietto[];
  richieste: Richiesta[];
  profili: (Iscritto & { telefono: string | null })[];
  /** dove si cerca: nomi, numeri, alias, mail, tessera, instagram */
  testo: string;
  /** l'ultima volta che è successo qualcosa, per l'ordine dei risultati */
  ultimo: string;
};

/** Senza maiuscole, accenti e apostrofi: "Nicolò D'Angelo" = "nicolo dangelo". */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nome e cognome come li ha scritti chi ha fatto il biglietto, senza spazi doppi. */
export function nomeIntero(nome: string, cognome: string): string {
  return `${nome} ${cognome}`.replace(/\s+/g, " ").trim();
}

/** La persona: le parole del nome in ordine, così "Rossi Mario" = "Mario Rossi". */
export function chiaveNome(nome: string): string {
  return norm(nome).split(" ").filter(Boolean).sort().join(" ");
}

/** Un numero in tutte le forme in cui lo si può scrivere cercandolo. */
export function formeNumero(grezzo: string | null | undefined): string {
  if (!grezzo) return "";
  const cifre = grezzo.replace(/\D/g, "");
  const n = normalizzaNumero(grezzo)?.slice(1) ?? cifre;
  const locale = n.startsWith("39") ? n.slice(2) : n;
  return `${cifre} ${n} ${locale}`;
}

/** Ogni parola scritta deve esserci. Le parole fatte di cifre si confrontano solo con le cifre. */
export function corrisponde(testo: string, cerca: string): boolean {
  const parole = norm(cerca)
    .split(" ")
    .map((p) => (/^[+\d().-]+$/.test(p) ? p.replace(/\D/g, "") : p))
    .filter(Boolean);
  return parole.length > 0 && parole.every((p) => testo.includes(p));
}

/** Mette insieme tutto quello che arriva, una persona per nome. */
export function costruisciPersone(
  iscritti: Iscritto[],
  numeriProfili: Map<string, string>,
  biglietti: Biglietto[],
  richieste: Richiesta[],
): Persona[] {
  const persone = new Map<string, Persona>();
  const prendi = (chiave: string, nome: string): Persona => {
    let p = persone.get(chiave);
    if (!p) {
      p = { chiave, nome, anno: null, telefoni: [], biglietti: [], richieste: [], profili: [], testo: "", ultimo: "" };
      persone.set(chiave, p);
    }
    return p;
  };
  const numero = (p: Persona, t: string | null | undefined) => {
    if (t && !p.telefoni.some((x) => (normalizzaNumero(x) ?? x) === (normalizzaNumero(t) ?? t))) p.telefoni.push(t);
  };
  const piuRecente = (p: Persona, iso: string) => {
    if (iso > p.ultimo) p.ultimo = iso;
  };

  for (const b of biglietti) {
    const nome = nomeIntero(b.nome, b.cognome);
    const p = prendi("n:" + chiaveNome(nome), nome);
    p.biglietti.push(b);
    numero(p, b.telefono);
    if (b.anno_nascita) p.anno = b.anno_nascita;
    piuRecente(p, b.created_at);
  }
  for (const r of richieste) {
    const nome = nomeIntero(r.nome, r.cognome);
    const p = prendi("n:" + chiaveNome(nome), nome);
    p.richieste.push(r);
    numero(p, r.telefono);
    if (!p.anno && r.nascita) p.anno = Number(r.nascita.slice(0, 4));
    piuRecente(p, r.created_at);
  }
  // Un profilo si unisce a una persona solo se il nome vero coincide:
  // i clienti del sito il nome non lo lasciano, restano a sé col loro alias.
  for (const i of iscritti) {
    const nome = i.nome?.trim();
    const chiave = nome && persone.has("n:" + chiaveNome(nome)) ? "n:" + chiaveNome(nome) : "p:" + i.id;
    const p = prendi(chiave, nome || i.alias);
    const telefono = numeriProfili.get(i.id) ?? null;
    p.profili.push({ ...i, telefono });
    numero(p, telefono);
    piuRecente(p, i.created_at);
  }

  for (const p of persone.values()) {
    p.testo = norm(
      [
        p.nome,
        ...p.telefoni.map(formeNumero),
        ...p.richieste.map((r) => r.instagram ?? ""),
        ...p.profili.flatMap((x) => [
          x.alias,
          x.email ?? "",
          x.nome ?? "",
          `#${x.member_number}`,
          `#${String(x.member_number).padStart(4, "0")}`,
        ]),
      ].join(" "),
    );
  }
  return [...persone.values()];
}
