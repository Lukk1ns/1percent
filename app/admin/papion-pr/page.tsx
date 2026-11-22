"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { apriWhatsapp, mostraNumero, normalizzaNumero } from "@/lib/whatsapp";
import {
  SCONTO_EURO,
  dataCorta,
  iniziali,
  messaggioBenvenutoPapion,
  ora,
  urlApp,
} from "@/lib/papion-pr";

type PR = {
  id: string;
  nome: string;
  cognome: string;
  telefono: string | null;
  link: string;
  foto: string | null;
  attivo: boolean;
  prevendite_1p: boolean;
  created_at: string;
  installata_at: string | null;
  aperta_at: string | null;
  presenze: number;
  ultima: string | null;
  presenze_30: number;
  stasera: boolean;
  drink: number;
  shot: number;
  sconti: number;
  tavoli: number;
  tavoli_budget: number;
};

type Presenza = {
  serata: string;
  entrato_at: string;
  da: "cassa" | "bar" | "direzione";
  numero: number;
  shot: boolean;
  /** 10ª, 20ª…: 2 drink e 2 shot (script 62) */
  extra: boolean;
  drink: number;
  shot_presi: number;
  sconti: number;
};

type Tavolo = {
  id: string;
  serata: string;
  nome: string;
  budget: number | null;
  bottiglie: string | null;
  stato: "segnato" | "venuto" | "non_venuto";
  pr?: string;
};

/** Un tocco al bar e il barista che l'ha fatto (script 67) */
type Tocco = {
  pr_id: string;
  serata: string;
  at: string;
  /** drink / shot = omaggio della serata · regalo = ogni 10 pagati · sconto / pagato = comprato */
  cosa: "drink" | "shot" | "regalo" | "sconto" | "pagato";
  /** il nome dato da Luka, se no l'inizio della mail; null = tocco senza barista */
  chi: string | null;
  email: string | null;
};

type SchedaDati = {
  presenze: Presenza[];
  sconti_fuori: { serata: string; n: number }[];
  tavoli: Tavolo[];
  /** c'è solo col 67 */
  bar?: Tocco[];
};

type SerataRiga = { serata: string; entrati: number; sconti: number; tavoli: number; adesso: boolean };

type SerataDati = {
  entrati: (Presenza & { pr_id: string; nome: string; cognome: string })[];
  sconti_senza_ingresso: { pr_id: string; nome: string; cognome: string; n: number }[];
  tavoli: Tavolo[];
  /** c'è solo col 67 */
  bar?: Tocco[];
};

const ICONA_OMAGGIO: Record<string, string> = { drink: "🍸", shot: "🥃", regalo: "🎁" };

const DA = { cassa: "cassa", bar: "dal bar", direzione: "a mano" } as const;

/**
 * I PR DEL PAPI-ON — il pannello di Luka (script 61).
 *
 * Due schede: i PR (aggiungi, manda l'app su WhatsApp, presenze, tavoli,
 * link nuovo) e le serate (chi è entrato, drink, shot, sconti, tavoli
 * da segnare venuto / non venuto). Non c'entra con i PR dell'1%.
 */
export default function PannelloPapionPR() {
  const [vista, setVista] = useState<"pr" | "serate">("pr");
  const [lista, setLista] = useState<PR[] | null>(null);
  const [manca, setManca] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [aperto, setAperto] = useState<string | null>(null);
  const [nuovo, setNuovo] = useState<false | "uno" | "lista">(false);
  const [mandati, setMandati] = useState<string[]>([]);

  // A chi Luka ha già toccato il tasto verde (su questo telefono): WhatsApp non lo dice al sito
  useEffect(() => {
    try {
      setMandati(JSON.parse(localStorage.getItem("papion_pr_mandati") ?? "[]"));
    } catch {
      // niente memoria: si parte da zero
    }
  }, []);
  const segnaMandato = useCallback((id: string) => {
    setMandati((m) => {
      const n = m.includes(id) ? m : [...m, id];
      try {
        localStorage.setItem("papion_pr_mandati", JSON.stringify(n));
      } catch {
        // pazienza
      }
      return n;
    });
  }, []);

  const carica = useCallback(async () => {
    const { data, error } = await createClient().rpc("admin_papion_pr_lista");
    if (error) {
      if (error.code === "PGRST202") setManca(true);
      else setErrore(error.message);
      setLista([]);
      return;
    }
    setManca(false);
    setLista((data ?? []) as PR[]);
  }, []);

  useEffect(() => {
    carica();
  }, [carica]);

  const attivi = (lista ?? []).filter((p) => p.attivo);
  const spenti = (lista ?? []).filter((p) => !p.attivo);
  const dentroStasera = attivi.filter((p) => p.stasera).length;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-20 pt-6">
      <p className="font-tech text-[10px] uppercase tracking-[0.3em] text-[#ff6b6b]">papi-on</p>
      <h1 className="mt-1 font-display text-4xl uppercase leading-none text-white">PR del PAPI-ON</h1>
      <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-brand-gray">
        Ognuno ha la sua app a un link personale. In cassa entra gratis e si carica il drink; al bar drink, shot ogni 5
        serate, alla 10ª 2 drink e 2 shot, e {SCONTO_EURO} € di sconto su un drink alla volta. Separati dai PR dell&apos;1%.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/admin/porta" className="border border-white/15 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.15em] text-white">
          scanner cassa →
        </Link>
        <Link href="/admin/bar" className="border border-white/15 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.15em] text-white">
          scanner bar →
        </Link>
      </div>

      {manca && (
        <div className="mt-6 border border-amber-400/50 bg-amber-400/10 px-4 py-4 text-[13px] leading-relaxed text-amber-200">
          Manca lo script sul database: incolla <strong>supabase/61_pr_papion.sql</strong> nel SQL Editor di Supabase.
        </div>
      )}
      {errore && <p className="mt-6 border border-brand-red/50 bg-brand-red/10 p-3 text-xs text-brand-red">{errore}</p>}

      <div className="mt-6 grid grid-cols-2 gap-2">
        {(
          [
            ["pr", `PR · ${attivi.length}`],
            ["serate", dentroStasera ? `Serate · ${dentroStasera} dentro ora` : "Serate"],
          ] as const
        ).map(([v, t]) => (
          <button
            key={v}
            onClick={() => setVista(v)}
            className={`px-3 py-3 font-tech text-[11px] uppercase tracking-[0.15em] ${
              vista === v ? "bg-white text-black" : "border border-white/15 text-white/70"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {vista === "pr" ? (
        <section className="mt-5">
          {!nuovo ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setNuovo("uno")}
                disabled={manca}
                className="bg-brand-red px-4 py-3.5 text-[12px] font-semibold uppercase tracking-widest text-white disabled:opacity-40"
              >
                + aggiungi un PR
              </button>
              <button
                onClick={() => setNuovo("lista")}
                disabled={manca}
                className="border border-brand-red px-4 py-3.5 text-[12px] font-semibold uppercase tracking-widest text-white disabled:opacity-40"
              >
                + incolla una lista
              </button>
            </div>
          ) : nuovo === "uno" ? (
            <ModuloPR
              onAnnulla={() => setNuovo(false)}
              onFatto={async (id) => {
                setNuovo(false);
                await carica();
                setAperto(id);
              }}
            />
          ) : (
            <IncollaLista
              esistenti={lista ?? []}
              onAnnulla={() => setNuovo(false)}
              onFatto={async () => {
                setNuovo(false);
                await carica();
              }}
            />
          )}

          {attivi.some((p) => p.telefono && !p.aperta_at && !mandati.includes(p.id)) && (
            <p className="mt-5 border-l-2 border-[#25D366] pl-3 text-[12px] leading-relaxed text-white/80">
              <strong className="text-white">
                {attivi.filter((p) => p.telefono && !p.aperta_at && !mandati.includes(p.id)).length} PR senza app:
              </strong>{" "}
              tocca il tasto verde su ognuno, WhatsApp si apre col messaggio già scritto. Torna qui e vai al prossimo.
            </p>
          )}

          {lista === null && <p className="mt-6 font-tech text-[11px] uppercase tracking-[0.3em] text-brand-gray">un attimo…</p>}
          {lista && lista.length === 0 && !manca && (
            <p className="mt-6 text-[13px] text-brand-gray">Ancora nessun PR: aggiungi il primo qui sopra.</p>
          )}

          <ul className="mt-4 flex flex-col gap-2">
            {attivi.map((p) => (
              <RigaPR
                key={p.id}
                p={p}
                aperta={aperto === p.id}
                onApri={() => setAperto(aperto === p.id ? null : p.id)}
                onCambio={carica}
                mandato={mandati.includes(p.id)}
                onMandato={() => segnaMandato(p.id)}
              />
            ))}
          </ul>

          {spenti.length > 0 && (
            <>
              <p className="mt-8 font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">non attivi · {spenti.length}</p>
              <ul className="mt-2 flex flex-col gap-2 opacity-60">
                {spenti.map((p) => (
                  <RigaPR key={p.id} p={p} aperta={aperto === p.id} onApri={() => setAperto(aperto === p.id ? null : p.id)} onCambio={carica} />
                ))}
              </ul>
            </>
          )}
        </section>
      ) : (
        <Serate />
      )}
    </main>
  );
}

/* ─────────────────────────────── I PR ─────────────────────────────── */

/** Le iniziali nel cerchio: niente foto (Luka, 17/11). */
function Avatar({ nome, cognome, lato = 44 }: { nome: string; cognome: string; lato?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-white/10 font-display text-white/70"
      style={{ width: lato, height: lato, fontSize: lato * 0.38 }}
    >
      {iniziali(nome, cognome)}
    </span>
  );
}

function RigaPR({
  p,
  aperta,
  onApri,
  onCambio,
  mandato,
  onMandato,
}: {
  p: PR;
  aperta: boolean;
  onApri: () => void;
  onCambio: () => void;
  mandato?: boolean;
  onMandato?: () => void;
}) {
  // Chi non ha mai aperto l'app ha il tasto verde subito in riga: si manda senza aprire la scheda
  const daMandare = Boolean(p.telefono && !p.aperta_at && p.attivo && onMandato);
  return (
    <li className={`border ${aperta ? "border-white/30" : "border-white/10"}`}>
      {daMandare && (
        <button
          onClick={() => {
            apriWhatsapp(p.telefono!, messaggioBenvenutoPapion(p.nome, p.link));
            onMandato?.();
          }}
          className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-widest ${
            mandato ? "border-b border-white/10 text-[#25D366]" : "bg-[#25D366] text-black"
          }`}
        >
          <span>{mandato ? "mandata ✓ · rimanda" : `manda l'app a ${p.nome}`}</span>
          <span aria-hidden>→</span>
        </button>
      )}
      <button onClick={onApri} className="flex w-full items-center gap-3 px-3 py-3 text-left">
        <Avatar nome={p.nome} cognome={p.cognome} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-[15px] font-semibold text-white">
            {p.nome} {p.cognome}
            {p.stasera && <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-brand-red" title="dentro stasera" />}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-brand-gray">
            {p.presenze} presenze{p.ultima ? ` · ultima ${dataCorta(p.ultima)}` : ""} · {p.tavoli} tavoli · {p.sconti} sconti
          </p>
        </div>
        <span
          className={`shrink-0 font-tech text-[9px] uppercase tracking-[0.12em] ${
            p.installata_at ? "text-emerald-400" : p.aperta_at ? "text-white/60" : "text-amber-300"
          }`}
        >
          {p.installata_at ? "app ✓" : p.aperta_at ? "aperta" : "mai aperta"}
        </span>
      </button>
      {aperta && <SchedaPR p={p} onCambio={onCambio} />}
    </li>
  );
}

function ModuloPR({
  p,
  onAnnulla,
  onFatto,
}: {
  p?: PR;
  onAnnulla: () => void;
  onFatto: (id: string) => void;
}) {
  const [nome, setNome] = useState(p?.nome ?? "");
  const [cognome, setCognome] = useState(p?.cognome ?? "");
  const [tel, setTel] = useState(p?.telefono ? mostraNumero(p.telefono) : "");
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    if (!nome.trim()) return setErrore("Scrivi il nome.");
    const numero = tel.trim() ? normalizzaNumero(tel) : null;
    if (tel.trim() && !numero) return setErrore("Numero non valido: scrivilo col prefisso, tipo +39 347…");
    setInvio(true);
    const { data, error } = await createClient().rpc("admin_papion_pr_salva", {
      p_id: p?.id ?? null,
      p_nome: nome,
      p_cognome: cognome,
      p_telefono: numero,
      p_attivo: p?.attivo ?? true,
      p_prevendite_1p: p?.prevendite_1p ?? false,
    });
    setInvio(false);
    if (error) return setErrore(error.message);
    onFatto(data as string);
  }

  const campo = "w-full border-b border-white/20 bg-transparent pb-2 pt-1 text-[15px] text-white outline-none focus:border-white";
  return (
    <form onSubmit={salva} noValidate className="border border-white/20 bg-white/[0.03] px-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={campo} autoFocus={!p} />
        </label>
        <label className="block">
          <span className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">cognome</span>
          <input value={cognome} onChange={(e) => setCognome(e.target.value)} className={campo} />
        </label>
      </div>
      <label className="mt-4 block">
        <span className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">whatsapp</span>
        <input value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" placeholder="347 123 4567" className={campo} />
      </label>
      {errore && <p className="mt-3 text-[12px] text-brand-red">{errore}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={invio} className="flex-1 bg-white py-3 text-[12px] font-semibold uppercase tracking-widest text-black disabled:opacity-50">
          {invio ? "salvo…" : p ? "salva" : "aggiungi"}
        </button>
        <button type="button" onClick={onAnnulla} className="border border-white/20 px-4 text-[11px] uppercase tracking-widest text-brand-gray">
          annulla
        </button>
      </div>
    </form>
  );
}

type Riga = { nome: string; cognome: string; telefono: string | null; problema: string | null; testo: string };

/**
 * Una riga = un PR: "Mario Rossi 347 123 4567". Il numero è il pezzo di
 * cifre in fondo (o in mezzo), il resto è il nome: la prima parola è il
 * nome, le altre il cognome. Senza numero si crea lo stesso, il messaggio
 * poi si copia a mano.
 */
function leggiRiga(testo: string, esistenti: PR[]): Riga {
  const pulito = testo
    // copiato da WhatsApp: "[17/11/26, 19:02] Mario: …" (iPhone) o "17/11/26, 19:02 - Mario: …" (Android)
    .replace(/^\s*\[[^\]]*\]\s*[^:]{1,40}:\s*/, "")
    .replace(/^\s*\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}\s*-\s*[^:]{1,40}:\s*/, "")
    // "Nick: … Tel: …"
    .replace(/(^|\s)(nick(name)?|nome|tel(efono)?|numero|num|cell(ulare)?)\s*[:=.]/gi, " ")
    .replace(/[\t;,|]+/g, " ")
    .trim();
  const m = pulito.match(/(\+|00)?\d[\d\s.\-/]{6,}\d/);
  const grezzo = m ? m[0] : "";
  const telefono = grezzo ? normalizzaNumero(grezzo) : null;
  // il nick resta com'è scritto (anche con _ . e numeri), senza @ e simboli
  const parole = pulito
    .replace(grezzo, " ")
    .replace(/[^\p{L}\p{M}\d_.'’\s-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[.\-_]+|[.\-_]+$/g, ""))
    .filter(Boolean);
  const nome = parole[0] ?? "";
  const cognome = parole.slice(1).join(" ");
  const chiave = `${nome} ${cognome}`.toLowerCase();
  let problema: string | null = null;
  if (!nome) problema = "manca il nome";
  else if (grezzo && !telefono) problema = "numero da controllare";
  else if (telefono && esistenti.some((e) => e.telefono === telefono)) problema = "c'è già (stesso numero)";
  else if (esistenti.some((e) => `${e.nome} ${e.cognome}`.toLowerCase().trim() === chiave.trim())) problema = "c'è già (stesso nome)";
  return { nome, cognome, telefono, problema, testo };
}

function IncollaLista({
  esistenti,
  onAnnulla,
  onFatto,
}: {
  esistenti: PR[];
  onAnnulla: () => void;
  onFatto: () => void;
}) {
  const [testo, setTesto] = useState("");
  const [fatti, setFatti] = useState<number | null>(null);
  const [errori, setErrori] = useState<string[]>([]);
  const righe = testo
    .split(/\n/)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => leggiRiga(r, esistenti));
  const buone = righe.filter((r) => !r.problema);

  async function aggiungi() {
    setErrori([]);
    setFatti(0);
    const sbagliate: string[] = [];
    const supabase = createClient();
    for (const r of buone) {
      const { error } = await supabase.rpc("admin_papion_pr_salva", {
        p_id: null,
        p_nome: r.nome,
        p_cognome: r.cognome,
        p_telefono: r.telefono,
        p_attivo: true,
        p_prevendite_1p: false,
      });
      if (error) sbagliate.push(`${r.testo} → ${error.message}`);
      else setFatti((n) => (n ?? 0) + 1);
    }
    setErrori(sbagliate);
    if (sbagliate.length === 0) onFatto();
  }

  return (
    <div className="border border-white/20 bg-white/[0.03] px-4 py-4">
      <p className="text-[13px] leading-relaxed text-white/80">
        Un PR per riga: <strong className="text-white">nome cognome numero</strong>. Va bene anche copiato dalla rubrica o
        da WhatsApp.
      </p>
      <textarea
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        rows={8}
        autoFocus
        placeholder={"Mario Rossi 347 123 4567\nGiulia Bianchi +39 338 765 4321"}
        className="mt-3 w-full border border-white/20 bg-black px-3 py-2 font-tech text-[13px] text-white placeholder-white/25 outline-none focus:border-white"
      />
      {righe.length > 0 && (
        <ul className="mt-3 divide-y divide-white/[0.06]">
          {righe.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
              <span className={r.problema ? "text-white/40" : "text-white"}>
                {r.nome} <span className="text-white/70">{r.cognome}</span>
              </span>
              <span className={`shrink-0 font-tech text-[11px] ${r.problema ? "text-amber-300" : "text-white/60"}`}>
                {r.problema ?? (r.telefono ? mostraNumero(r.telefono) : "senza numero")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {errori.length > 0 && (
        <div className="mt-3 border border-brand-red/50 bg-brand-red/10 p-3 text-[12px] text-brand-red">
          Non aggiunti:
          {errori.map((e) => (
            <p key={e} className="mt-1">
              {e}
            </p>
          ))}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button
          onClick={aggiungi}
          disabled={buone.length === 0 || fatti !== null}
          className="flex-1 bg-white py-3 text-[12px] font-semibold uppercase tracking-widest text-black disabled:opacity-40"
        >
          {fatti !== null ? `aggiunti ${fatti} di ${buone.length}…` : `aggiungi ${buone.length} PR`}
        </button>
        <button
          onClick={errori.length ? onFatto : onAnnulla}
          className="border border-white/20 px-4 text-[11px] uppercase tracking-widest text-brand-gray"
        >
          {errori.length ? "chiudi" : "annulla"}
        </button>
      </div>
      {righe.some((r) => r.problema) && (
        <p className="mt-2 text-[11px] text-amber-300">Le righe in giallo non si aggiungono: correggile o toglile.</p>
      )}
    </div>
  );
}

function SchedaPR({ p, onCambio }: { p: PR; onCambio: () => void }) {
  const [d, setD] = useState<SchedaDati | null>(null);
  const [modifica, setModifica] = useState(false);
  const [copiato, setCopiato] = useState<string | null>(null);
  const [giorno, setGiorno] = useState("");

  const leggi = useCallback(async () => {
    const { data } = await createClient().rpc("admin_papion_pr_scheda", { p_id: p.id });
    setD((data as SchedaDati) ?? { presenze: [], sconti_fuori: [], tavoli: [] });
  }, [p.id]);

  useEffect(() => {
    leggi();
  }, [leggi]);

  async function copia(testo: string, cosa: string) {
    try {
      await navigator.clipboard.writeText(testo);
      setCopiato(cosa);
      setTimeout(() => setCopiato(null), 2000);
    } catch {
      window.prompt("Copia da qui:", testo);
    }
  }

  async function rpc(nome: string, args: object, conferma?: string) {
    if (conferma && !window.confirm(conferma)) return null;
    const { data, error } = await createClient().rpc(nome, args);
    if (error) {
      window.alert(error.message);
      return null;
    }
    return data;
  }

  const benvenuto = messaggioBenvenutoPapion(p.nome, p.link);

  return (
    <div className="border-t border-white/10 px-3 pb-4 pt-3">
      {/* Mandargli l'app */}
      <div className="flex flex-col gap-2">
        {p.telefono ? (
          <button
            onClick={() => apriWhatsapp(p.telefono!, benvenuto)}
            className="w-full bg-[#25D366] py-3 text-[12px] font-semibold uppercase tracking-widest text-black"
          >
            manda l&apos;app su whatsapp · {mostraNumero(p.telefono)}
          </button>
        ) : (
          <button onClick={() => copia(benvenuto, "msg")} className="w-full bg-white py-3 text-[12px] font-semibold uppercase tracking-widest text-black">
            {copiato === "msg" ? "messaggio copiato ✓" : "copia il messaggio con l'app"}
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => copia(urlApp(p.link), "link")} className="border border-white/15 py-2.5 font-tech text-[10px] uppercase tracking-[0.15em] text-white">
            {copiato === "link" ? "copiato ✓" : "copia link"}
          </button>
          <a
            href={`/papion/pr/${p.link}`}
            target="_blank"
            rel="noreferrer"
            className="border border-white/15 py-2.5 text-center font-tech text-[10px] uppercase tracking-[0.15em] text-white"
          >
            apri la sua app ↗
          </a>
        </div>
      </div>

      {/* I numeri */}
      <p className="mt-4 font-tech text-[11px] leading-relaxed text-white/70">
        {p.presenze} presenze ({p.presenze_30} negli ultimi 30 giorni) · {p.drink} drink · {p.shot} shot · {p.sconti} sconti
        (−{p.sconti * SCONTO_EURO} €) · {p.tavoli} tavoli
        {p.tavoli_budget ? ` · ${p.tavoli_budget} € di budget` : ""}
      </p>
      <p className="mt-1 font-tech text-[10px] text-brand-gray">
        PR dal {new Date(p.created_at).toLocaleDateString("it-IT")} ·{" "}
        {p.installata_at
          ? `app sulla Home dal ${new Date(p.installata_at).toLocaleDateString("it-IT")}`
          : p.aperta_at
            ? "ha aperto il link, non ancora messa sulla Home"
            : "non ha ancora aperto il link"}
      </p>

      {/* Modifica */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => setModifica((v) => !v)} className="border border-white/15 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.15em] text-white">
          {modifica ? "chiudi modifica" : "modifica nome / numero"}
        </button>
        <Interruttore
          acceso={p.prevendite_1p}
          testo="fa anche prevendite 1%"
          onClick={async () => {
            await rpc("admin_papion_pr_salva", {
              p_id: p.id, p_nome: p.nome, p_cognome: p.cognome, p_telefono: p.telefono,
              p_attivo: p.attivo, p_prevendite_1p: !p.prevendite_1p,
            });
            onCambio();
          }}
        />
        <Interruttore
          acceso={p.attivo}
          testo={p.attivo ? "attivo" : "non attivo"}
          onClick={async () => {
            const ok = await rpc(
              "admin_papion_pr_salva",
              {
                p_id: p.id, p_nome: p.nome, p_cognome: p.cognome, p_telefono: p.telefono,
                p_attivo: !p.attivo, p_prevendite_1p: p.prevendite_1p,
              },
              p.attivo ? `Togliere ${p.nome} dai PR? L'app si chiude e in cassa non entra più gratis. Presenze e tavoli restano.` : undefined,
            );
            if (ok !== null) onCambio();
          }}
        />
      </div>
      {modifica && (
        <div className="mt-3">
          <ModuloPR
            p={p}
            onAnnulla={() => setModifica(false)}
            onFatto={() => {
              setModifica(false);
              onCambio();
            }}
          />
        </div>
      )}

      {/* Presenze */}
      <p className="mt-6 font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">presenze</p>
      <div className="mt-2 flex gap-2">
        <input
          type="date"
          value={giorno}
          onChange={(e) => setGiorno(e.target.value)}
          className="flex-1 border border-white/15 bg-black px-2 py-2 text-[13px] text-white"
        />
        <button
          disabled={!giorno}
          onClick={async () => {
            const r = await rpc("admin_papion_pr_presenza", { p_pr: p.id, p_serata: giorno, p_on: true });
            if (r === "data") window.alert("Solo serate di stasera o passate.");
            else if (r === "gia") window.alert("Quella sera la presenza c'è già.");
            setGiorno("");
            leggi();
            onCambio();
          }}
          className="border border-white/15 px-3 font-tech text-[10px] uppercase tracking-[0.15em] text-white disabled:opacity-40"
        >
          + presenza a mano
        </button>
      </div>
      <ul className="mt-2 divide-y divide-white/[0.06]">
        {d?.presenze.map((x) => (
          <li key={x.serata} className="py-2">
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="text-white">
                {dataCorta(x.serata)} <span className="text-brand-gray">· {ora(x.entrato_at)} {DA[x.da]} · n.{x.numero}</span>
              </span>
              <span className="flex items-center gap-2 font-tech text-[11px] text-white/70">
                <span className={x.drink ? "" : "opacity-25 grayscale"}>🍸{x.extra ? `×${x.drink}` : ""}</span>
                {x.shot && <span className={x.shot_presi ? "" : "opacity-25 grayscale"}>🥃{x.extra ? `×${x.shot_presi}` : ""}</span>}
                {x.sconti > 0 && <span>−{x.sconti}€</span>}
                <button
                  onClick={async () => {
                    const r = await rpc(
                      "admin_papion_pr_presenza",
                      { p_pr: p.id, p_serata: x.serata, p_on: false },
                      `Togliere la presenza di ${dataCorta(x.serata)}? Se ha preso drink o shot, sparisce anche quello.`,
                    );
                    if (r !== null) {
                      leggi();
                      onCambio();
                    }
                  }}
                  className="ml-1 text-brand-gray"
                  aria-label="togli presenza"
                >
                  ✕
                </button>
              </span>
            </div>
            {d.bar && <ChiAlBar tocchi={d.bar.filter((t) => t.serata === x.serata)} />}
          </li>
        ))}
        {d && d.presenze.length === 0 && <li className="py-2 text-[12px] text-brand-gray">Nessuna presenza.</li>}
      </ul>
      {d && d.sconti_fuori.length > 0 && (
        <div className="mt-2 text-[11px] text-amber-300">
          <p>Sconti in sere senza ingresso: {d.sconti_fuori.map((s) => `${dataCorta(s.serata)} ×${s.n}`).join(" · ")}</p>
          {d.bar &&
            d.sconti_fuori.map((s) => (
              <div key={s.serata} className="mt-1">
                <span>{dataCorta(s.serata)}</span>
                <ChiAlBar tocchi={d.bar!.filter((t) => t.serata === s.serata)} />
              </div>
            ))}
        </div>
      )}

      {/* Tavoli */}
      <p className="mt-6 font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">tavoli</p>
      <ul className="mt-2 divide-y divide-white/[0.06]">
        {d?.tavoli.map((t) => <RigaTavolo key={t.id} t={t} onCambio={leggi} />)}
        {d && d.tavoli.length === 0 && <li className="py-2 text-[12px] text-brand-gray">Nessun tavolo segnato.</li>}
      </ul>

      {/* Le cose pesanti */}
      <div className="mt-8 flex flex-wrap gap-2 border-t border-white/10 pt-4">
        <button
          onClick={async () => {
            const r = await rpc(
              "admin_papion_pr_nuovo_link",
              { p_id: p.id },
              `Link e QR nuovi per ${p.nome}? Quelli vecchi smettono subito di funzionare: gli devi rimandare l'app.`,
            );
            if (r) onCambio();
          }}
          className="border border-amber-400/40 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.15em] text-amber-300"
        >
          link nuovo
        </button>
        <button
          onClick={async () => {
            const r = await rpc(
              "admin_papion_pr_elimina",
              { p_id: p.id },
              `Eliminare ${p.nome} ${p.cognome} con tutte le presenze, gli sconti e i tavoli? Non si torna indietro. (Per toglierlo e basta usa "attivo".)`,
            );
            if (r !== null) onCambio();
          }}
          className="border border-brand-red/40 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-red"
        >
          elimina
        </button>
      </div>
    </div>
  );
}

function Interruttore({ acceso, testo, onClick }: { acceso: boolean; testo: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 font-tech text-[10px] uppercase tracking-[0.15em] ${
        acceso ? "border border-emerald-400/50 text-emerald-300" : "border border-white/15 text-brand-gray"
      }`}
    >
      {acceso ? "● " : "○ "}
      {testo}
    </button>
  );
}

function RigaTavolo({ t, onCambio }: { t: Tavolo; onCambio: () => void }) {
  async function stato(s: Tavolo["stato"]) {
    const { error } = await createClient().rpc("admin_papion_pr_tavolo_stato", { p_id: t.id, p_stato: s });
    if (error) window.alert(error.message);
    onCambio();
  }
  return (
    <li className="py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-[13px]">
          <p className="text-white">
            <span className="text-brand-gray">{dataCorta(t.serata)} · </span>
            {t.nome}
            {t.pr && <span className="text-brand-gray"> · di {t.pr}</span>}
          </p>
          <p className="mt-0.5 text-[12px] text-white/60">{[t.budget ? `${t.budget} €` : null, t.bottiglie].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          {(
            [
              ["venuto", "venuto"],
              ["non_venuto", "no"],
            ] as const
          ).map(([s, testo]) => (
            <button
              key={s}
              onClick={() => stato(t.stato === s ? "segnato" : s)}
              className={`px-2 py-1.5 font-tech text-[9px] uppercase tracking-[0.12em] ${
                t.stato === s
                  ? s === "venuto"
                    ? "bg-emerald-500 text-black"
                    : "bg-white/20 text-white"
                  : "border border-white/15 text-brand-gray"
              }`}
            >
              {testo}
            </button>
          ))}
        </div>
      </div>
    </li>
  );
}

/* ─────────────────────────────── LE SERATE ─────────────────────────────── */

function Serate() {
  const [serate, setSerate] = useState<SerataRiga[] | null>(null);
  const [scelta, setScelta] = useState<string | null>(null);
  const [d, setD] = useState<SerataDati | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await createClient().rpc("admin_papion_pr_serate");
      const righe = (data ?? []) as SerataRiga[];
      setSerate(righe);
      setScelta(righe.find((r) => r.adesso)?.serata ?? righe[0]?.serata ?? null);
    })();
  }, []);

  const leggi = useCallback(async () => {
    if (!scelta) return;
    const { data } = await createClient().rpc("admin_papion_pr_serata", { p_serata: scelta });
    setD(data as SerataDati);
  }, [scelta]);

  useEffect(() => {
    setD(null);
    leggi();
  }, [leggi]);

  const drink = d?.entrati.reduce((a, e) => a + e.drink, 0) ?? 0;
  const shot = d?.entrati.reduce((a, e) => a + e.shot_presi, 0) ?? 0;
  const sconti =
    (d?.entrati.reduce((a, e) => a + e.sconti, 0) ?? 0) + (d?.sconti_senza_ingresso.reduce((a, s) => a + s.n, 0) ?? 0);
  const budget = d?.tavoli.filter((t) => t.stato !== "non_venuto").reduce((a, t) => a + (t.budget ?? 0), 0) ?? 0;

  return (
    <section className="mt-5">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {serate?.map((s) => (
          <button
            key={s.serata}
            onClick={() => setScelta(s.serata)}
            className={`shrink-0 px-3 py-2 text-left ${
              scelta === s.serata ? "bg-white text-black" : "border border-white/15 text-white/70"
            }`}
          >
            <span className="block font-tech text-[10px] uppercase tracking-[0.1em]">{s.adesso ? "stasera" : dataCorta(s.serata)}</span>
            <span className="block text-[10px] opacity-70">
              {s.entrati} pr · {s.tavoli} tav.
            </span>
          </button>
        ))}
      </div>

      {d && (
        <>
          <p className="mt-4 font-tech text-[11px] text-white/70">
            {d.entrati.length} PR entrati · {drink} drink · {shot} shot · {sconti} sconti (−{sconti * SCONTO_EURO} €) ·{" "}
            {d.tavoli.length} tavoli{budget ? ` · ${budget} € di budget` : ""}
          </p>

          {d.bar && d.bar.length > 0 && <Baristi tocchi={d.bar} onCambio={leggi} />}

          <p className="mt-5 font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">entrati</p>
          <ul className="mt-2 divide-y divide-white/[0.06]">
            {d.entrati.map((e) => (
              <li key={e.pr_id} className="flex items-center gap-3 py-2">
                <Avatar nome={e.nome} cognome={e.cognome} lato={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-white">
                    {e.nome} {e.cognome}
                  </p>
                  <p className="text-[11px] text-brand-gray">
                    {ora(e.entrato_at)} {DA[e.da]} · serata n.{e.numero}
                    {e.extra ? " · premio dei 10" : e.shot ? " · shot" : ""}
                  </p>
                  {d.bar && <ChiAlBar tocchi={d.bar.filter((t) => t.pr_id === e.pr_id)} />}
                </div>
                <span className="flex items-center gap-2 font-tech text-[11px] text-white/70">
                  <span className={e.drink ? "" : "opacity-25 grayscale"} title="drink omaggio presi">
                    🍸{e.extra ? `×${e.drink}` : ""}
                  </span>
                  {e.shot && (
                    <span className={e.shot_presi ? "" : "opacity-25 grayscale"} title="shot omaggio presi">
                      🥃{e.extra ? `×${e.shot_presi}` : ""}
                    </span>
                  )}
                  {e.sconti > 0 && <span>−{e.sconti}€</span>}
                </span>
              </li>
            ))}
            {d.entrati.length === 0 && <li className="py-2 text-[12px] text-brand-gray">Nessun PR entrato.</li>}
          </ul>

          {d.sconti_senza_ingresso.length > 0 && (
            <div className="mt-2 text-[11px] text-amber-300">
              <p>Sconti senza ingresso segnato: {d.sconti_senza_ingresso.map((s) => `${s.nome} ×${s.n}`).join(" · ")}</p>
              {d.bar &&
                d.sconti_senza_ingresso.map((s) => (
                  <div key={s.pr_id} className="mt-1">
                    <span>
                      {s.nome} {s.cognome}
                    </span>
                    <ChiAlBar tocchi={d.bar!.filter((t) => t.pr_id === s.pr_id)} />
                  </div>
                ))}
            </div>
          )}

          <p className="mt-6 font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">tavoli dei pr</p>
          <ul className="mt-2 divide-y divide-white/[0.06]">
            {d.tavoli.map((t) => <RigaTavolo key={t.id} t={t} onCambio={leggi} />)}
            {d.tavoli.length === 0 && <li className="py-2 text-[12px] text-brand-gray">Nessun tavolo segnato.</li>}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * Da quale barista ha preso gli omaggi e da quale ha comprato (script 67).
 * Luka, 22/11: "da quale barista andavano a farsi fare il drink gratis e
 * da quale barista acquistano la roba".
 */
function ChiAlBar({ tocchi }: { tocchi: Tocco[] }) {
  const gratis = tocchi.filter((t) => t.cosa in ICONA_OMAGGIO);
  const comprati = tocchi.filter((t) => t.cosa === "sconto" || t.cosa === "pagato");
  if (gratis.length === 0 && comprati.length === 0) return null;
  const perChi = new Map<string, number>();
  for (const t of comprati) perChi.set(t.chi ?? "?", (perChi.get(t.chi ?? "?") ?? 0) + 1);
  return (
    <div className="mt-1 space-y-0.5 text-[11px] leading-snug text-white/65">
      {gratis.length > 0 && (
        <p>
          <span className="text-brand-gray">omaggio da </span>
          {gratis.map((t, i) => (
            <span key={i} className="whitespace-nowrap">
              {i > 0 && <span className="text-brand-gray"> · </span>}
              {ICONA_OMAGGIO[t.cosa]} {t.chi ?? "?"} <span className="text-brand-gray">{ora(t.at)}</span>
            </span>
          ))}
        </p>
      )}
      {comprati.length > 0 && (
        <p>
          <span className="text-brand-gray">comprati da </span>
          {[...perChi].map(([chi, n], i) => (
            <span key={chi} className="whitespace-nowrap">
              {i > 0 && <span className="text-brand-gray"> · </span>}
              {chi} ×{n}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/** La serata vista dal bar: cosa ha dato e venduto ogni barista. Toccando il nome, Luka lo chiama come vuole. */
function Baristi({ tocchi, onCambio }: { tocchi: Tocco[]; onCambio: () => void }) {
  type Riga = { chi: string; email: string | null; drink: number; shot: number; regalo: number; sconto: number; pagato: number };
  const mappa = new Map<string, Riga>();
  for (const t of tocchi) {
    const k = t.email ?? "?";
    const r = mappa.get(k) ?? { chi: t.chi ?? "?", email: t.email, drink: 0, shot: 0, regalo: 0, sconto: 0, pagato: 0 };
    r[t.cosa]++;
    mappa.set(k, r);
  }
  const righe = [...mappa.values()].sort(
    (a, b) => b.drink + b.shot + b.regalo + b.sconto + b.pagato - (a.drink + a.shot + a.regalo + a.sconto + a.pagato),
  );

  async function rinomina(r: Riga) {
    if (!r.email) return;
    const nome = window.prompt(`Come si chiama questo barista?\n${r.email}\n(lascia vuoto per tornare alla mail)`, r.chi);
    if (nome === null) return;
    const { error } = await createClient().rpc("admin_papion_barista_nome", { p_email: r.email, p_nome: nome });
    if (error) window.alert(error.message);
    else onCambio();
  }

  return (
    <>
      <p className="mt-5 font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">al bar · chi ha servito i pr</p>
      <ul className="mt-2 divide-y divide-white/[0.06]">
        {righe.map((r) => {
          const venduti = r.sconto + r.pagato;
          const nominabile = !!r.email && r.email !== "sconosciuto";
          return (
            <li key={r.email ?? "?"} className="flex items-center justify-between gap-3 py-2">
              <button
                onClick={() => rinomina(r)}
                disabled={!nominabile}
                className="min-w-0 truncate text-left text-[13px] text-white"
                title={r.email ?? undefined}
              >
                {r.chi}
                {nominabile && <span className="ml-1.5 text-[11px] text-brand-gray">✎</span>}
              </button>
              <span className="flex shrink-0 items-center gap-2 font-tech text-[11px] text-white/70">
                {r.drink > 0 && <span title="drink omaggio">🍸{r.drink}</span>}
                {r.shot > 0 && <span title="shot omaggio">🥃{r.shot}</span>}
                {r.regalo > 0 && <span title="drink in regalo (ogni 10 pagati)">🎁{r.regalo}</span>}
                {venduti > 0 && (
                  <span title="drink venduti ai pr">
                    venduti {venduti}
                    {r.sconto > 0 && <span className="text-brand-gray"> ({r.sconto} a −{SCONTO_EURO}€)</span>}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-[10px] text-brand-gray">Tocca il nome per chiamarlo come vuoi (all&apos;inizio si vede la sua mail).</p>
    </>
  );
}
