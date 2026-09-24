"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { accentoSerata, dataLunga, giornoEData, ora } from "@/lib/eventi";

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

type Fascia = {
  id: string;
  label: string;
  price: number;
  esaurita: boolean;
  countdown_on: boolean;
  /** Quanto è piena la fascia, da mostrare al PR. Niente numeri: solo questa. */
  percentuale: number | null;
};

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

type Ingresso = {
  token: string;
  attivo: boolean;
  vendute: number;
  soglia: number;
  mancano: number;
  forzato: boolean;
  usato_at: string | null;
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
    `Fallo scansionare all'ingresso, non serve stamparlo. ` +
    `Ricordati il documento fisico, non la foto sul telefono: serve a tutti.`
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
  // Nome già presente: all'admin si offre di insistere, al PR no.
  const [omonimo, setOmonimo] = useState(false);
  const [appenaFatto, setAppenaFatto] = useState<Biglietto | null>(null);
  const [copiato, setCopiato] = useState(false);
  // Il pass del PR: esiste per serata e si accende con le vendite.
  const [ingresso, setIngresso] = useState<Ingresso | null>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

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

    // Il pass non fa parte del blocco di sopra: se manca lo script
    // non deve portarsi dietro il resto della pagina.
    const { data: ing } = await supabase.rpc("pr_ingresso", { p_event: evento });
    setIngresso((ing?.[0] as Ingresso) ?? null);

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

  // Il QR contiene il token nudo, come quello dei biglietti: è quello
  // che lo scanner della porta si aspetta di leggere.
  useEffect(() => {
    if (!ingresso?.token || !qrRef.current) return;
    QRCode.toCanvas(qrRef.current, ingresso.token, {
      width: 200,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
  }, [ingresso?.token]);

  async function vendi(e: React.FormEvent, forza = false) {
    e.preventDefault();
    setSalvando(true);
    setEsito(null);
    setOmonimo(false);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("pr_vendi", {
      p_event: evento,
      p_tier: fascia,
      p_nome: nome,
      p_cognome: cognome,
      p_anno: Number(anno),
      p_telefono: telefono,
      p_forza: forza,
    });
    setSalvando(false);

    if (error) {
      setEsito(error.message);
      return;
    }

    const res = data?.[0];
    if (res?.esito === "gia_presente") {
      setEsito(
        `${nome.trim()} ${cognome.trim()} ha già un biglietto per questa serata. ` +
          (r?.senza_limite
            ? "Se è un omonimo davvero diverso, puoi farlo lo stesso."
            : "Se è un'altra persona con lo stesso nome, chiedi a Luka."),
      );
      setOmonimo(true);
      return;
    }
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
  const accento = accentoSerata(evento);

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
          <p
            className="mt-2 font-tech text-[10px] uppercase tracking-[0.25em]"
            style={{ color: accento }}
          >
            {ev ? `${giornoEData(ev.starts_at)} · ${ev.nome}` : ""}
          </p>
          <h1 className="mt-2 font-display text-3xl uppercase leading-none text-white">
            {appenaFatto.nome} {appenaFatto.cognome}
          </h1>
          <p className="mt-2 text-xs text-brand-gray">
            {appenaFatto.tier_label} · {Number(appenaFatto.prezzo).toFixed(0)} € da incassare
          </p>

          {appenaFatto.under16 && (
            <div className="mt-4 border border-amber-400/40 bg-amber-400/5 px-4 py-3">
              <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-amber-300">
                meno di 16 anni
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/70">
                Oltre al documento fisico gli serve la delega firmata da un genitore.
                Diglielo adesso, non in porta.
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

        {/* Con due serate aperte insieme — il sabato notte e la domenica
            pomeriggio — questa fascia resta in alto mentre si scrive, così
            non si sbaglia serata di fretta. */}
        <div
          className="sticky top-0 z-30 -mx-5 mt-4 border-b border-l-4 bg-black/95 px-5 py-3 backdrop-blur"
          style={{ borderLeftColor: accento, borderBottomColor: `${accento}44` }}
        >
          <p
            className="font-tech text-[10px] uppercase tracking-[0.3em]"
            style={{ color: accento }}
          >
            {ev ? giornoEData(ev.starts_at) : "serata"} · stai lavorando qui
          </p>
          <p className="mt-1 font-display text-2xl uppercase leading-none text-white">
            {ev?.nome ?? "Serata"}
          </p>
        </div>

        {ev && <p className="mt-3 text-xs text-brand-gray">{quando}</p>}

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

        {/* Il tasto che serve davvero, in cima e grosso. Il modulo per
            fare i nominativi sta in fondo alla pagina, sotto conti e
            avvisi: da telefono non lo trovava nessuno — un PR ha
            scritto "non trovo dove vendere le prevendite". */}
        {!(r.residue <= 0 && !r.senza_limite) && r.vendite_on !== false && (
          <a
            href="#nuovo"
            className="mt-6 block bg-brand-red py-4 text-center text-sm font-semibold uppercase tracking-widest text-white"
          >
            + fai un biglietto
          </a>
        )}

        {/* Il secondo tasto, più piccolo e spento: porta alla lista di
            chi hai messo dentro e a quanto vale. Chiesto dai PR — da
            lì si rimanda il link a chi l'ha perso, che era la domanda
            che arrivava ogni sera su WhatsApp. */}
        <a
          href="#tuoi"
          className="mt-2 block border border-white/20 bg-white/[0.03] py-3 text-center font-tech text-[11px] uppercase tracking-[0.2em] text-brand-gray transition-colors hover:border-white/40 hover:text-white"
        >
          vedi dettagli
          {biglietti.length > 0 ? ` · ${biglietti.length}` : ""}
          {!r.senza_limite && Number(r.dovuto) > 0
            ? ` · ${Number(r.dovuto).toFixed(0)}€`
            : ""}
        </a>

        {/* Il conto della serata, scritto grande: è la cosa che un PR
            deve sapere sempre, senza doverla ricavare da tre numeri.
            Sta qui sopra il modulo, così la vede ogni volta che scrive
            un nominativo. */}
        {!r.senza_limite && (
          <div
            className={`mt-4 border px-4 py-5 ${
              Number(r.da_portare) > 0
                ? "border-brand-red/50 bg-brand-red/[0.07]"
                : "border-emerald-400/40 bg-emerald-400/5"
            }`}
          >
            <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">
              i tuoi conti per questa serata
            </p>

            <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="font-display text-4xl leading-none text-white">{r.vendute}</p>
                <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                  prevendite fatte
                </p>
              </div>
              <div>
                <p
                  className={`font-display text-4xl leading-none ${
                    Number(r.da_portare) > 0 ? "text-brand-red" : "text-emerald-400"
                  }`}
                >
                  {Number(r.da_portare).toFixed(0)}€
                </p>
                <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                  da consegnare
                </p>
              </div>
              <div>
                <p className="font-display text-4xl leading-none text-white">{r.residue}</p>
                <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                  ancora in mano
                </p>
              </div>
            </div>

            {Number(r.consegnato) > 0 && (
              <p className="mt-3 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                già consegnati {Number(r.consegnato).toFixed(0)}€ su{" "}
                {Number(r.dovuto).toFixed(0)}€
              </p>
            )}

            <p className="mt-4 border-t border-white/10 pt-3 text-[12px] leading-relaxed text-white/80">
              <span className="text-white">Quando si consegna:</span> il giorno preciso te lo
              comunichiamo noi, ma comunque <span className="text-white">prima della serata</span>.
              Le prevendite che hai venduto e non hai ancora saldato{" "}
              <span className="text-white">non vengono convalidate</span>: chi le ha comprate,
              in porta, non entra.
            </p>
          </div>
        )}

        {/* Il suo ingresso alla festa. Sta qui, sotto i conti: è la
            cosa che un PR guarda più spesso dopo quanto deve portare. */}
        {ingresso && !r.senza_limite && (
          <div
            className={`mt-4 border px-4 py-5 ${
              ingresso.usato_at
                ? "border-white/15 bg-white/[0.02]"
                : ingresso.attivo
                  ? "border-emerald-400/50 bg-emerald-400/[0.07]"
                  : "border-white/15 bg-white/[0.02]"
            }`}
          >
            <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">
              il tuo ingresso
            </p>
            <p
              className={`mt-1 font-display text-2xl uppercase leading-none ${
                ingresso.usato_at
                  ? "text-brand-gray"
                  : ingresso.attivo
                    ? "text-emerald-400"
                    : "text-white"
              }`}
            >
              {ingresso.usato_at
                ? "Già usato"
                : ingresso.attivo
                  ? "Attivo"
                  : "Non ancora attivo"}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-5">
              <div
                className={`bg-white p-2 transition-opacity ${
                  ingresso.attivo && !ingresso.usato_at ? "" : "opacity-25"
                }`}
              >
                <canvas ref={qrRef} />
              </div>

              <div className="min-w-[12rem] flex-1">
                {ingresso.usato_at ? (
                  <p className="text-[12px] leading-relaxed text-brand-gray">
                    Sei già entrato con questo pass: vale una volta sola.
                  </p>
                ) : ingresso.attivo ? (
                  <>
                    <p className="text-[12px] leading-relaxed text-white">
                      {ingresso.forzato
                        ? "Te l'ha acceso Luka."
                        : `Hai fatto ${ingresso.vendute} prevendite: l'ingresso è tuo.`}
                    </p>
                    <p className="mt-2 text-[11px] leading-relaxed text-brand-gray">
                      Fallo scansionare in porta. Vale una volta sola e solo per questa
                      serata.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-display text-3xl leading-none text-white">
                      {ingresso.vendute}
                      <span className="text-brand-gray">/{ingresso.soglia}</span>
                    </p>
                    <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                      prevendite fatte
                    </p>
                    <p className="mt-3 text-[12px] leading-relaxed text-white">
                      Ti {ingresso.mancano === 1 ? "manca" : "mancano"}{" "}
                      <span className="text-brand-red">{ingresso.mancano}</span>{" "}
                      {ingresso.mancano === 1 ? "prevendita" : "prevendite"} e il tuo
                      ingresso si accende da solo.
                    </p>
                  </>
                )}
              </div>
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

        {/* L'avviso delle ultime prevendite: lo accende Luka, fascia per
            fascia. Il PR vede quanto è piena, mai quante ne restano. */}
        {fasce.some((f) => f.countdown_on) && (
          <div className="mt-6 flex flex-col gap-3">
            {fasce
              .filter((f) => f.countdown_on)
              .map((f) => {
                const pct = f.percentuale ?? 0;
                const finita = f.esaurita || pct >= 100;
                return (
                  <div
                    key={f.id}
                    className={`border px-4 py-4 ${
                      finita
                        ? "border-brand-red/50 bg-brand-red/10"
                        : "border-amber-400/50 bg-amber-400/5"
                    }`}
                  >
                    <p
                      className={`font-display text-2xl uppercase leading-none ${
                        finita ? "text-brand-red" : "text-amber-300"
                      }`}
                    >
                      {finita ? `${f.label}: finite` : `${f.label} al ${pct}%`}
                    </p>
                    <div className="mt-3 h-1.5 w-full bg-white/10">
                      <div
                        className={finita ? "h-full bg-brand-red" : "h-full bg-amber-400"}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-white/70">
                      {finita
                        ? "Per questa fascia non ci sono più prevendite. Chi vuole entrare paga in cassa."
                        : "Siamo alle ultime. Chi ce l'ha in mano la chiuda adesso."}
                    </p>
                  </div>
                );
              })}
          </div>
        )}

        {/* Nuovo nominativo */}
        <div id="nuovo" className="mt-8 scroll-mt-4 border border-brand-red/40 px-4 py-5">
          <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">
            qui si vende
          </p>
          <p className="mt-1 font-display text-2xl uppercase leading-none text-white">
            Nuovo nominativo
          </p>

          {r.residue <= 0 && !r.senza_limite ? (
            <p className="mt-3 text-sm leading-relaxed text-white">
              {r.assegnate === 0
                ? "Per questa serata non ti hanno ancora dato prevendite: chiedile a Luka e qui sotto comparirà il modulo per fare i nominativi."
                : "Hai usato tutte le prevendite che ti sono state date. Chiedine altre a Luka."}
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
                  onChange={(e) => {
                    setNome(e.target.value);
                    setOmonimo(false);
                  }}
                  required
                  className="w-1/2 border-b border-white/20 bg-transparent pb-2 text-sm text-white placeholder-brand-gray/50 outline-none transition-colors focus:border-brand-red"
                />
                <input
                  placeholder="cognome"
                  value={cognome}
                  onChange={(e) => {
                    setCognome(e.target.value);
                    setOmonimo(false);
                  }}
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
                    const bloccata = f.esaurita && !r.senza_limite;
                    const scelta = fascia === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        disabled={bloccata}
                        onClick={() => setFascia(f.id)}
                        className={`border px-4 py-3 text-left transition-colors ${
                          scelta
                            ? "border-brand-red bg-brand-red/10"
                            : "border-white/15 hover:border-white/40"
                        } ${bloccata ? "opacity-30" : ""}`}
                      >
                        <span className="block text-sm text-white">{f.label}</span>
                        <span className="block font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                          {Number(f.price).toFixed(0)} €
                          {f.esaurita ? " · esaurita" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* L'errore deve saltare agli occhi: prima era una riga
                  rossa piccola sotto il modulo e chi vendeva di fretta
                  non la vedeva, concludendo "non funziona". */}
              {esito && (
                <div className="border border-brand-red bg-brand-red/10 px-4 py-3">
                  <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-red">
                    non è andata
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-white">{esito}</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-brand-gray">
                    Se non si sblocca, manda questa schermata a Luka: c&apos;è scritto il motivo.
                  </p>
                </div>
              )}
              {omonimo && r.senza_limite && (
                <button
                  type="button"
                  disabled={salvando}
                  onClick={(e) => vendi(e, true)}
                  className="border border-amber-400/60 px-4 py-3 font-tech text-[10px] uppercase tracking-[0.2em] text-amber-200 disabled:opacity-40"
                >
                  è un&apos;altra persona · fallo lo stesso
                </button>
              )}

              {fasce.length > 0 && (
                <button
                  type="submit"
                  disabled={salvando || !fascia}
                  className="mt-1 bg-brand-red py-4 text-sm font-semibold uppercase tracking-widest text-white disabled:opacity-40"
                >
                  {salvando
                    ? "Salvo…"
                    : ev
                      ? `Fai il biglietto · ${giornoEData(ev.starts_at)}`
                      : "Fai il biglietto"}
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
        <div id="tuoi" className="mt-8 scroll-mt-4">
          <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">
            chi hai messo in lista
          </p>
          <p className="mt-1 font-display text-2xl uppercase leading-none text-white">
            {biglietti.length}{" "}
            {biglietti.length === 1 ? "nominativo" : "nominativi"}
            {!r.senza_limite && Number(r.dovuto) > 0 && (
              <span className="text-brand-gray"> · {Number(r.dovuto).toFixed(0)}€</span>
            )}
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
                        {b.under16 && (
                          <span className="ml-2 font-tech text-[9px] uppercase tracking-[0.15em] text-amber-300">
                            under 16 · delega
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
