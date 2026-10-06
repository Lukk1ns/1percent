"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import {
  INDIRIZZO_PAPION,
  LOCANDINA_STORIA,
  LOCANDINA_WEB,
  SLUG_MALDITA,
  type StatoRichiesta,
  oraRoma,
  riempi,
} from "@/lib/omaggio";

type Mia = {
  lista: string;
  nome: string;
  cognome: string;
  stato: StatoRichiesta;
  titolo: string;
  starts_at: string;
  valido_fino: string;
  qr: string | null;
  qr_stato: "attiva" | "usata" | "annullata" | null;
  entrata_at: string | null;
  minorenne: boolean;
  sorpresa_on: boolean;
  sorpresa_testo: string | null;
  ig_tag: string | null;
  shot_at: string | null;
};

/**
 * La pagina personale: il link è l'indirizzo, nessuna iscrizione.
 *
 * Dice a che punto è la prenotazione e, quando è confermata, mostra il
 * QR da far scansionare in cassa. Si aggiorna da sola: se Luka approva
 * mentre lei ha la pagina aperta, il QR compare senza ricaricare.
 * Quando Luka accende la sorpresa, qui compare lo shot.
 */
export default function MiaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [m, setM] = useState<Mia | null>(null);
  const [letto, setLetto] = useState(false);
  const [adesso, setAdesso] = useState(() => Date.now());
  const [copiato, setCopiato] = useState(false);
  const [shotErr, setShotErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let vivo = true;
    async function leggi() {
      const { data } = await supabase.rpc("omaggio_mia", { p_token: token });
      if (!vivo) return;
      setM((data?.[0] as Mia) ?? null);
      setLetto(true);
      setAdesso(Date.now());
    }
    leggi();
    const t = setInterval(leggi, 20000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [token]);

  useEffect(() => {
    if (!canvasRef.current || !m?.qr) return;
    QRCode.toCanvas(canvasRef.current, m.qr, {
      width: 250,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
  }, [m?.qr]);

  async function salvaLink() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Il mio ingresso · MALDITA", url });
        return;
      }
    } catch {
      // annullato: si prova a copiare
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2500);
    } catch {
      window.prompt("Copia questo link:", url);
    }
  }

  async function shot() {
    if (!window.confirm("Lo fa il barista: confermi che lo shot è stato dato?")) return;
    setShotErr(null);
    const { data, error } = await createClient().rpc("omaggio_shot", { p_token: token });
    const esito = (data?.[0] as { esito: string } | undefined)?.esito;
    if (error || !esito) return setShotErr("Il sito non risponde, riprova.");
    if (esito === "non_entrata") return setShotErr("Lo shot vale quando sei già dentro il locale.");
    if (esito === "no") return setShotErr("La sorpresa non è attiva.");
    const { data: d2 } = await createClient().rpc("omaggio_mia", { p_token: token });
    setM((d2?.[0] as Mia) ?? m);
  }

  if (!letto) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="font-tech text-[11px] uppercase tracking-[0.3em] text-white/40 animate-pulse">un attimo…</p>
      </main>
    );
  }

  if (!m) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-3xl uppercase text-white">Link non valido</p>
        <p className="mt-3 max-w-xs text-sm text-white/60">
          Questo link non corrisponde a nessuna prenotazione. Controlla di averlo copiato per intero.
        </p>
        <Link href={`/${SLUG_MALDITA}`} className="mt-6 border border-white/25 px-5 py-3 font-tech text-[11px] uppercase tracking-[0.2em]">
          vai alla prenotazione
        </Link>
      </main>
    );
  }

  const scadenza = oraRoma(m.valido_fino);
  const scaduto = m.qr_stato === "attiva" && adesso > new Date(m.valido_fino).getTime();
  const entrata = m.qr_stato === "usata";
  const tag = m.ig_tag;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-16 pt-5">
      <div className="flex items-center gap-3">
        {/* Misure in style: in globals.css `img { height: auto }` sta fuori dai
            layer di Tailwind e batte h-24, quindi la miniatura usciva enorme. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LOCANDINA_WEB}
          alt=""
          width={54}
          height={96}
          style={{ width: 54, height: 96 }}
          className="shrink-0 border border-white/10 object-cover"
        />
        <div className="min-w-0">
          <p className="font-tech text-[10px] uppercase tracking-[0.3em] text-[#ff5a5f]">donna omaggio</p>
          <p className="mt-1 font-display text-2xl uppercase leading-none text-white">{m.titolo}</p>
          <p className="mt-1.5 text-[12px] text-white/60">sabato 17 ottobre · nuovo PAPI-ON</p>
        </div>
      </div>

      <h1 className="mt-7 font-display text-4xl uppercase leading-none text-white">
        {m.nome} {m.cognome}
      </h1>

      {/* LO STATO */}
      {m.stato === "in_attesa" && (
        <Riquadro colore="ambra" titolo="Prenotazione ricevuta">
          Ora la confermiamo noi. Quando è confermata il tuo QR compare <strong>qui, su questa pagina</strong>,
          e ti scriviamo su WhatsApp. <strong>Salva questo link</strong> per ritrovarla.
        </Riquadro>
      )}

      {m.stato === "lista_attesa" && (
        <Riquadro colore="ambra" titolo="Sei in lista d'attesa">
          I posti omaggio sono tutti assegnati. Se se ne libera uno il QR compare qui e ti scriviamo su
          WhatsApp. <strong>Salva questo link.</strong>
        </Riquadro>
      )}

      {m.stato === "rifiutata" && (
        <Riquadro colore="grigio" titolo="Non confermata">
          Questa volta non siamo riusciti a confermare il tuo omaggio. Sabato puoi entrare comunque,
          pagando l&apos;ingresso. Ti aspettiamo.
        </Riquadro>
      )}

      {m.stato === "approvata" && m.qr && (
        <section className="mt-5 border border-white/12 bg-white/[0.03] px-4 pb-5 pt-4">
          <p
            className={`text-center font-tech text-[11px] uppercase tracking-[0.25em] ${
              entrata ? "text-emerald-300" : scaduto ? "text-white/50" : "text-emerald-300"
            }`}
          >
            {entrata ? `sei entrata alle ${oraRoma(m.entrata_at!)} ✓` : scaduto ? "scaduto" : "confermato · il tuo ingresso"}
          </p>
          <div className="mt-3 flex justify-center">
            <div className={`bg-white p-2 ${entrata || scaduto ? "opacity-25 grayscale" : ""}`}>
              <canvas ref={canvasRef} className="block" />
            </div>
          </div>
          <p className="mt-3 text-center font-display text-xl uppercase text-white">omaggio donna</p>

          {!entrata && (
            <div
              className={`mt-4 px-3 py-3 text-center ${
                scaduto ? "border border-white/15" : "border-2 border-[#e0181f] bg-[#e0181f]/10"
              }`}
            >
              <p className="font-display text-2xl uppercase leading-none text-white">
                {scaduto ? `Valeva fino alle ${scadenza}` : `Valido solo entro le ${scadenza}`}
              </p>
              <p className="mt-1.5 text-[12px] leading-snug text-white/75">
                {scaduto
                  ? `Dopo le ${scadenza} l'omaggio non vale più: l'ingresso si paga.`
                  : `Fai scansionare il QR in cassa prima delle ${scadenza}. Dopo si paga, senza eccezioni.`}
              </p>
            </div>
          )}

          {!entrata && !scaduto && (
            <ul className="mt-4 space-y-1.5 text-[12px] leading-relaxed text-white/70">
              <li>· Porta il <strong className="text-white">documento d&apos;identità vero, in mano</strong>: la foto non vale.</li>
              <li>· Il QR vale per te sola e una volta sola: uno screenshot girato a un&apos;amica non la fa entrare.</li>
              {m.minorenne && <li>· Hai meno di 18 anni: il documento te lo chiediamo di sicuro.</li>}
            </ul>
          )}
        </section>
      )}

      {/* LA SORPRESA: compare quando Luka la accende */}
      {m.sorpresa_on && m.stato === "approvata" && (
        <section
          className="mt-5 border border-[#e0181f]/60 px-4 py-5"
          style={{ background: "linear-gradient(160deg, rgba(224,24,31,0.22), rgba(0,0,0,0) 70%)" }}
        >
          <p className="font-tech text-[10px] uppercase tracking-[0.3em] text-[#ff8a8e]">una sorpresa per te</p>
          <p className="mt-1 font-display text-3xl uppercase leading-none text-white">Uno shot offerto 🥃</p>
          {m.sorpresa_testo && (
            <p className="mt-3 text-[13px] leading-relaxed text-white/80">
              {riempi(m.sorpresa_testo, { nome: m.nome, tag })}
            </p>
          )}

          {!m.shot_at && (
            <a
              href={LOCANDINA_STORIA}
              download="MALDITA-PAPION-17-ottobre.jpg"
              className="mt-4 block w-full border border-white/30 px-4 py-3 text-center font-tech text-[11px] uppercase tracking-[0.2em] text-white"
            >
              ↓ scarica la locandina per la storia
            </a>
          )}

          {m.shot_at ? (
            <p className="mt-4 border border-emerald-400/50 bg-emerald-400/10 px-3 py-3 text-center font-tech text-[11px] uppercase tracking-[0.2em] text-emerald-300">
              shot ritirato alle {oraRoma(m.shot_at)} ✓
            </p>
          ) : entrata ? (
            <>
              <p className="mt-4 text-[12px] text-white/60">Al bar: fai vedere la storia e questa schermata.</p>
              <button
                onClick={shot}
                className="mt-2 w-full bg-white px-4 py-4 font-display text-lg uppercase text-black"
              >
                Il barista conferma lo shot
              </button>
            </>
          ) : (
            <p className="mt-3 text-[11px] text-white/45">Lo shot si ritira al bar, una volta entrata.</p>
          )}
          {shotErr && <p className="mt-2 text-[12px] text-[#ff8a8e]">{shotErr}</p>}
        </section>
      )}

      {!entrata && m.stato !== "rifiutata" && (
        <button
          onClick={salvaLink}
          className="mt-5 w-full border border-white/25 px-4 py-3.5 font-tech text-[11px] uppercase tracking-[0.2em] text-white"
        >
          {copiato ? "link copiato ✓" : "salva / condividi il link di questa pagina"}
        </button>
      )}

      <footer className="mt-10 text-center">
        <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-white/50">sabato 17 ottobre · dalle 23:00</p>
        <p className="mt-1 text-[11px] text-white/40">{INDIRIZZO_PAPION}</p>
      </footer>
    </main>
  );
}

function Riquadro({
  colore,
  titolo,
  children,
}: {
  colore: "ambra" | "grigio";
  titolo: string;
  children: React.ReactNode;
}) {
  const stile =
    colore === "ambra" ? "border-amber-400/50 bg-amber-400/[0.07] text-amber-200" : "border-white/20 bg-white/[0.03] text-white/70";
  return (
    <section className={`mt-5 border px-4 py-4 ${stile}`}>
      <p className="font-display text-2xl uppercase leading-none text-white">{titolo}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-white/75">{children}</p>
    </section>
  );
}
