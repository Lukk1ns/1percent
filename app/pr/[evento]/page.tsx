"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dataLunga, ora } from "@/lib/eventi";

type Riepilogo = {
  assegnate: number;
  vendute: number;
  residue: number;
  in_attesa: number;
  attive: number;
  entrate: number;
  dovuto: number;
  consegnato: number;
  da_portare: number;
  vendite_on: boolean;
  /** L'admin vende senza blocchetti e senza scorte: niente lo ferma. */
  senza_limite: boolean;
};

type Fascia = { id: string; label: string; price: number; stock: number | null; rimaste: number | null };

type Biglietto = {
  id: string;
  nome: string;
  cognome: string;
  anno_nascita: number;
  telefono: string | null;
  tier_label: string;
  prezzo: number;
  token: string;
  stato: "in_attesa" | "attiva" | "usata" | "annullata";
  minorenne: boolean;
  under16: boolean;
  created_at: string;
};

type EventoPR = {
  event_id: string;
  nome: string;
  locale: string | null;
  starts_at: string;
  residue: number;
};

const ANNO = new Date().getFullYear();

/**
 * Il numero come lo vuole WhatsApp: solo cifre, con il prefisso.
 * Un cellulare italiano scritto "347 123 4567" diventa "393471234567".
 */
function numeroWhatsapp(grezzo: string | null): string | null {
  if (!grezzo) return null;
  let n = grezzo.replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("00")) n = n.slice(2);
  else if (n.startsWith("3") && n.length >= 9) n = "39" + n;
  return n.length >= 10 ? n : null;
}

function linkBiglietto(token: string): string {
  if (typeof window === "undefined") return `/biglietto/${token}`;
  return `${window.location.origin}/biglietto/${token}`;
}

function messaggio(b: { nome: string; token: string }, evento: string, quando: string): string {
  return (
    `Ciao ${b.nome}! Ecco il tuo biglietto per ${evento} — ${quando}.\n\n` +
    `${linkBiglietto(b.token)}\n\n` +
    `Fallo scansionare all'ingresso. Non serve stamparlo.`
  );
}

/** Apre WhatsApp col messaggio già scritto: l'invio lo fa il PR. */
function apriWhatsapp(numero: string | null, testo: string) {
  const base = numero ? `https://wa.me/${numero}` : "https://wa.me/";
  window.open(`${base}?text=${encodeURIComponent(testo)}`, "_blank");
}

export default function PrEventoPage({ params }: { params: Promise<{ evento: string }> }) {
  const { evento } = use(params);
  const router = useRouter();

  const [ev, setEv] = useState<EventoPR | null>(null);
  const [r, setR] = useState<Riepilogo | null>(null);
  const [fasce, setFasce] = useState<Fascia[]>([]);
  const [biglietti, setBiglietti] = useState<Biglietto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  // Il modulo di vendita
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [anno, setAnno] = useState("");
  const [telefono, setTelefono] = useState("");
  const [fascia, setFascia] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);
  const [appenaFatto, setAppenaFatto] = useState<Biglietto | null>(null);
  const [copiato, setCopiato] = useState(false);

  const carica = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace(`/login?next=/pr/${evento}`);
      return;
    }

    const [evRes, rRes, fRes, bRes] = await Promise.all([
      supabase.rpc("pr_eventi"),
      supabase.rpc("pr_riepilogo", { p_event: evento }),
      supabase.rpc("pr_fasce", { p_event: evento }),
      supabase.rpc("pr_miei_biglietti", { p_event: evento }),
    ]);

    if (rRes.error) {
      setErrore(rRes.error.message);
      setLoading(false);
      return;
    }

    const mio = (evRes.data ?? []).find((x: EventoPR) => x.event_id === evento) ?? null;
    setEv(mio);
    setR(rRes.data?.[0] ?? null);
    setFasce(fRes.data ?? []);
    setBiglietti(bRes.data ?? []);
    setFascia((f) => f || (fRes.data?.[0]?.id ?? ""));
    setLoading(false);
  }, [evento, router]);

  useEffect(() => {
    carica();
  }, [carica]);

  async function vendi(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setEsito(null);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("pr_vendi", {
      p_event: evento,
      p_tier: fascia,
      p_nome: nome,
      p_cognome: cognome,
      p_anno: Number(anno),
      p_telefono: telefono,
    });
    setSalvando(false);

    if (error) {
      setEsito(error.message);
      return;
    }

    const res = data?.[0];
    if (res?.esito !== "ok") {
      setEsito(
        {
          chiuso: "Le prevendite non sono ancora aperte.",
          vendite_ferme: "Le vendite sono state chiuse da Luka.",
          fascia_sconosciuta: "Fascia non valida. Ricarica la pagina.",
          finite: "Hai finito le prevendite che ti sono state date.",
          fascia_esaurita: "Questa fascia è esaurita.",
          dati_mancanti: "Servono nome e cognome.",
        }[res?.esito as string] ?? "Non è andata. Riprova.",
      );
      return;
    }

    setAppenaFatto({
      id: "",
      nome: nome.trim(),
      cognome: cognome.trim(),
      anno_nascita: Number(anno),
      telefono: telefono.trim() || null,
      tier_label: fasce.find((f) => f.id === fascia)?.label ?? "",
      prezzo: Number(res.prezzo),
      token: res.token,
      stato: r?.senza_limite ? "attiva" : "in_attesa",
      minorenne: Boolean(res.minorenne),
      under16: Boolean(res.under16),
      created_at: new Date().toISOString(),
    });
    setNome("");
    setCognome("");
    setAnno("");
    setTelefono("");
    setCopiato(false);
    await carica();
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="font-display text-6xl text-brand-red animate-pulse-glow">1%</div>
      </main>
    );
  }

  if (errore || !r) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="max-w-sm text-sm leading-relaxed text-brand-gray">
          {errore ?? "Non riesco a leggere questa serata."}
        </p>
        <Link href="/pr" className="mt-8 font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray hover:text-white">
          ← le tue serate
        </Link>
      </main>
    );
  }

  const quando = ev ? `${dataLunga(ev.starts_at)} ore ${ora(ev.starts_at)}` : "";

  // Appena venduto: la cosa da fare adesso è una sola, mandarlo su WhatsApp.
  if (appenaFatto) {
    const num = numeroWhatsapp(appenaFatto.telefono);
    const testo = messaggio(appenaFatto, ev?.nome ?? "la serata", quando);
    return (
      <main className="flex-1 px-5 py-10">
        <div className="mx-auto w-full max-w-sm">
          <p className="font-tech text-[10px] uppercase tracking-[0.35em] text-emerald-400">
            fatto
          </p>
          <h1 className="mt-2 font-display text-3xl uppercase leading-none text-white">
            {appenaFatto.nome} {appenaFatto.cognome}
          </h1>
          <p className="mt-2 text-xs text-brand-gray">
            {appenaFatto.tier_label} · {Number(appenaFatto.prezzo).toFixed(0)} € da incassare
          </p>

          {appenaFatto.minorenne && (
            <div className="mt-4 border border-amber-400/40 bg-amber-400/5 px-4 py-3">
              <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-amber-300">
                {appenaFatto.under16 ? "meno di 16 anni" : "minorenne"}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/70">
                {appenaFatto.under16
                  ? "All'ingresso servono documento e delega firmata da un genitore. Diglielo adesso, non in porta."
                  : "Avvisalo che all'ingresso serve il documento."}
              </p>
            </div>
          )}

          <button
            onClick={() => apriWhatsapp(num, testo)}
            className="mt-6 w-full bg-brand-red py-4 text-sm font-semibold uppercase tracking-widest text-white"
          >
            {num ? "Mandaglielo su WhatsApp" : "Apri WhatsApp"}
          </button>
          {!num && (
            <p className="mt-2 text-center text-[11px] text-brand-gray">
              Non hai messo il numero: scegli tu il contatto dentro WhatsApp.
            </p>
          )}

          <button
            onClick={() => {
              navigator.clipboard?.writeText(linkBiglietto(appenaFatto.token));
              setCopiato(true);
            }}
            className="mt-3 w-full border border-white/20 py-3 text-[10px] uppercase tracking-[0.25em] text-white transition-colors hover:border-brand-red"
          >
            {copiato ? "link copiato" : "copia solo il link"}
          </button>

          <div className="mt-6 border border-white/10 px-4 py-3">
            {r.senza_limite ? (
              <p className="text-[11px] leading-relaxed text-brand-gray">
                Questo biglietto è <strong className="text-emerald-400">già valido</strong>:
                l&apos;hai fatto tu, i soldi sono in cassa. In porta passa subito.
              </p>
            ) : (
              <p className="text-[11px] leading-relaxed text-brand-gray">
                Il biglietto è <strong className="text-white">in attesa</strong> finché non
                consegni l&apos;incasso a Luka. Prima di allora in porta non passa.
              </p>
            )}
          </div>

          <button
            onClick={() => setAppenaFatto(null)}
            className="mt-6 w-full border border-white/20 py-4 font-tech text-[10px] uppercase tracking-[0.25em] text-white transition-colors hover:border-brand-red"
          >
            un altro nominativo →
          </button>

          <Link
            href={r.senza_limite ? "/admin/pr" : "/pr"}
            className="mt-3 block w-full py-3 text-center font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray hover:text-white"
          >
            {r.senza_limite ? "← ho finito, torno al pannello" : "← ho finito, torno alle serate"}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 px-5 py-10">
      <div className="mx-auto w-full max-w-lg">
        <Link href="/pr" className="font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray hover:text-white">
          ← le tue serate
        </Link>

        <h1 className="mt-4 font-display text-3xl uppercase leading-none text-white">
          {ev?.nome ?? "Serata"}
        </h1>
        {ev && <p className="mt-2 text-xs text-brand-gray">{quando}</p>}

        {/* Chi vende come direzione non ha blocchetti da consumare */}
        {r.senza_limite ? (
          <>
            <div className="mt-6 border border-brand-red/40 bg-brand-red/5 px-4 py-3">
              <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-red">
                stai vendendo come direzione
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-white/70">
                Nessun limite: vendi anche a vendite chiuse e a fascia esaurita. Quello che
                fai tu nasce già valido, perché i soldi li hai in mano.
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="border border-white/10 px-3 py-4">
                <p className="font-display text-3xl leading-none text-white">{r.vendute}</p>
                <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                  fatte da te
                </p>
              </div>
              <div className="border border-white/10 px-3 py-4">
                <p className="font-display text-3xl leading-none text-white">
                  {Number(r.dovuto).toFixed(0)}€
                </p>
                <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                  incassati
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="border border-white/10 px-3 py-4">
              <p className="font-display text-3xl leading-none text-brand-red">{r.residue}</p>
              <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                da vendere
              </p>
            </div>
            <div className="border border-white/10 px-3 py-4">
              <p className="font-display text-3xl leading-none text-white">{r.vendute}</p>
              <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                fatte
              </p>
            </div>
            <div className="border border-white/10 px-3 py-4">
              <p className="font-display text-3xl leading-none text-white">
                {Number(r.da_portare).toFixed(0)}€
              </p>
              <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                da portare
              </p>
            </div>
          </div>
        )}

        {/* L'avviso che evita la gente bloccata in porta */}
        {r.in_attesa > 0 && !r.senza_limite && (
          <div className="mt-4 border border-amber-400/40 bg-amber-400/5 px-4 py-4">
            <p className="font-display text-xl uppercase leading-none text-amber-300">
              {r.in_attesa} {r.in_attesa === 1 ? "biglietto" : "biglietti"} in attesa
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-white/70">
              Diventano validi quando porti a Luka {Number(r.da_portare).toFixed(0)} €.
              Finché non lo fai, quelle persone in porta non entrano.
            </p>
          </div>
        )}

        {/* Nuovo nominativo */}
        <div className="mt-8 border border-white/10 px-4 py-5">
          <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">
            nuovo nominativo
          </p>

          {r.residue <= 0 && !r.senza_limite ? (
            <p className="mt-3 text-sm leading-relaxed text-white">
              Hai usato tutte le prevendite che ti sono state date. Chiedine altre a Luka.
            </p>
          ) : !r.vendite_on && !r.senza_limite ? (
            <p className="mt-3 text-sm leading-relaxed text-white">
              Le vendite sono chiuse in questo momento.
            </p>
          ) : (
            <form onSubmit={vendi} className="mt-4 flex flex-col gap-4">
              <div className="flex gap-3">
                <input
                  placeholder="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                  className="w-1/2 border-b border-white/20 bg-transparent pb-2 text-sm text-white placeholder-brand-gray/50 outline-none transition-colors focus:border-brand-red"
                />
                <input
                  placeholder="cognome"
                  value={cognome}
                  onChange={(e) => setCognome(e.target.value)}
                  required
                  className="w-1/2 border-b border-white/20 bg-transparent pb-2 text-sm text-white placeholder-brand-gray/50 outline-none transition-colors focus:border-brand-red"
                />
              </div>

              <div className="flex gap-3">
                <input
                  type="number"
                  placeholder="anno di nascita"
                  value={anno}
                  onChange={(e) => setAnno(e.target.value)}
                  required
                  min={ANNO - 90}
                  max={ANNO - 12}
                  className="w-1/2 border-b border-white/20 bg-transparent pb-2 text-sm text-white placeholder-brand-gray/50 outline-none transition-colors focus:border-brand-red"
                />
                <input
                  type="tel"
                  placeholder="telefono"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  className="w-1/2 border-b border-white/20 bg-transparent pb-2 text-sm text-white placeholder-brand-gray/50 outline-none transition-colors focus:border-brand-red"
                />
              </div>

              {fasce.length === 0 ? (
                r.senza_limite ? (
                  <div className="border border-amber-400/40 bg-amber-400/5 px-4 py-4">
                    <p className="font-display text-lg uppercase leading-none text-amber-300">
                      Mancano i prezzi
                    </p>
                    <p className="mt-2 text-[11px] leading-relaxed text-white/70">
                      Senza almeno una fascia di prezzo non si può fare nessun biglietto:
                      è il prezzo che finisce dentro al biglietto.
                    </p>
                    <Link
                      href="/admin/pr"
                      className="mt-3 inline-block border border-amber-400/60 px-4 py-3 font-tech text-[10px] uppercase tracking-[0.2em] text-amber-200"
                    >
                      metti i prezzi →
                    </Link>
                  </div>
                ) : (
                  <p className="text-[11px] leading-relaxed text-brand-gray">
                    Per questa serata non ci sono ancora i prezzi. Avvisa Luka.
                  </p>
                )
              ) : (
                <div className="flex flex-wrap gap-2">
                  {fasce.map((f) => {
                    const esaurita = f.rimaste !== null && f.rimaste <= 0 && !r.senza_limite;
                    const scelta = fascia === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        disabled={esaurita}
                        onClick={() => setFascia(f.id)}
                        className={`border px-4 py-3 text-left transition-colors ${
                          scelta
                            ? "border-brand-red bg-brand-red/10"
                            : "border-white/15 hover:border-white/40"
                        } ${esaurita ? "opacity-30" : ""}`}
                      >
                        <span className="block text-sm text-white">{f.label}</span>
                        <span className="block font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                          {Number(f.price).toFixed(0)} €
                          {f.rimaste !== null ? ` · ne restano ${Math.max(f.rimaste, 0)}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {esito && <p className="text-sm text-brand-red">{esito}</p>}

              {fasce.length > 0 && (
                <button
                  type="submit"
                  disabled={salvando || !fascia}
                  className="mt-1 bg-brand-red py-4 text-sm font-semibold uppercase tracking-widest text-white disabled:opacity-40"
                >
                  {salvando ? "Salvo…" : "Fai il biglietto"}
                </button>
              )}
              {fasce.length > 0 && !fascia && (
                <p className="text-[11px] text-amber-300">
                  Scegli una fascia qui sopra: è quella che decide il prezzo.
                </p>
              )}

              {!r.senza_limite && (
                <p className="text-[10px] leading-relaxed text-brand-gray/60">
                  Inserisci il nominativo solo quando hai in mano i soldi: il biglietto non si
                  cancella e la cifra resta a tuo carico.
                </p>
              )}
            </form>
          )}
        </div>

        {/* I suoi clienti */}
        <div className="mt-8">
          <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">
            i tuoi ({biglietti.length})
          </p>

          <div className="mt-3 flex flex-col gap-2">
            {biglietti.map((b) => {
              const num = numeroWhatsapp(b.telefono);
              return (
                <div key={b.id} className="border border-white/10 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">
                        {b.nome} {b.cognome}
                        {b.minorenne && (
                          <span className="ml-2 font-tech text-[9px] uppercase tracking-[0.15em] text-amber-300">
                            {b.under16 ? "under 16 · delega" : "minorenne"}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                        {b.tier_label} · {Number(b.prezzo).toFixed(0)} €
                      </p>
                    </div>
                    <span
                      className={`flex-shrink-0 font-tech text-[9px] uppercase tracking-[0.15em] ${
                        b.stato === "attiva"
                          ? "text-emerald-400"
                          : b.stato === "usata"
                            ? "text-brand-gray"
                            : b.stato === "annullata"
                              ? "text-brand-gray/40 line-through"
                              : "text-amber-300"
                      }`}
                    >
                      {b.stato === "attiva"
                        ? "valido"
                        : b.stato === "usata"
                          ? "entrato"
                          : b.stato === "annullata"
                            ? "annullato"
                            : "in attesa"}
                    </span>
                  </div>

                  {b.stato !== "annullata" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() =>
                          apriWhatsapp(num, messaggio(b, ev?.nome ?? "la serata", quando))
                        }
                        className="border border-white/15 px-3 py-2 font-tech text-[9px] uppercase tracking-[0.15em] text-white transition-colors hover:border-brand-red"
                      >
                        rimanda
                      </button>
                      <a
                        href={`/biglietto/${b.token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="border border-white/10 px-3 py-2 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray transition-colors hover:text-white"
                      >
                        vedi
                      </a>
                    </div>
                  )}
                </div>
              );
            })}

            {biglietti.length === 0 && (
              <p className="border border-white/10 px-4 py-6 text-center text-[12px] text-brand-gray">
                Ancora nessuno. Il primo nominativo lo scrivi qui sopra.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
