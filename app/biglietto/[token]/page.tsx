"use client";

import { use, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import { locandinaSfocataUrl } from "@/lib/locandina";
import { dataLunga, ora } from "@/lib/eventi";
import { DELEGA_UNDER16_URL } from "@/lib/event";

type Biglietto = {
  nome: string;
  cognome: string;
  tier_label: string;
  prezzo: number;
  stato: "in_attesa" | "attiva" | "usata" | "annullata";
  minorenne: boolean;
  under16: boolean;
  evento: string;
  locale: string | null;
  citta: string | null;
  indirizzo: string | null;
  starts_at: string;
  cover_key: string | null;
  cover_v: number | null;
};

/**
 * Il biglietto del cliente.
 *
 * È l'unica pagina pubblica del modulo: la apre chi ha ricevuto il link
 * su WhatsApp, senza iscriversi a niente. Chi non ha il token non trova
 * nulla — il token è l'indirizzo.
 *
 * Lo stato è vero in tempo reale: finché il PR non ha consegnato i
 * contanti c'è scritto "in attesa", e in porta non si entra. Quando Luka
 * segna l'incasso, la stessa pagina diventa verde da sola.
 */
export default function BigliettoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [b, setB] = useState<Biglietto | null>(null);
  const [caricato, setCaricato] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let vivo = true;

    async function leggi() {
      const { data } = await supabase.rpc("biglietto", { p_token: token });
      if (!vivo) return;
      setB(data?.[0] ?? null);
      setCaricato(true);
    }

    leggi();
    // Il cliente può avere la pagina aperta mentre il PR salda: si aggiorna da sé.
    const t = setInterval(leggi, 20000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [token]);

  useEffect(() => {
    if (!canvasRef.current || !b) return;
    QRCode.toCanvas(canvasRef.current, token, {
      width: 260,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
  }, [b, token]);

  if (!caricato) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="font-display text-6xl text-brand-red animate-pulse-glow">1%</div>
      </main>
    );
  }

  if (!b) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 font-display text-6xl text-brand-red">%</div>
        <h1 className="mb-3 text-xl font-semibold text-white">Biglietto non trovato</h1>
        <p className="max-w-xs text-sm text-brand-gray">
          Questo link non corrisponde a nessun biglietto. Controlla di averlo copiato
          per intero, o richiedilo a chi te l&apos;ha mandato.
        </p>
      </main>
    );
  }

  const annullato = b.stato === "annullata";
  const usato = b.stato === "usata";
  const sfondo = b.cover_key ? locandinaSfocataUrl(b.cover_key, b.cover_v) : null;

  return (
    <main className="relative flex-1 px-5 py-10">
      {sfondo && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sfondo}
            alt=""
            aria-hidden
            className="pointer-events-none fixed inset-0 h-full w-full object-cover opacity-25"
          />
          <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-black/70 via-black/85 to-black" />
        </>
      )}

      <div className="relative mx-auto w-full max-w-sm">
        <p className="text-center font-tech text-[10px] uppercase tracking-[0.35em] text-brand-gray">
          ingresso
        </p>
        <h1 className="mt-2 text-center font-display text-3xl uppercase leading-none text-white">
          {b.evento}
        </h1>
        <p className="mt-2 text-center text-xs text-brand-gray">
          {dataLunga(b.starts_at)} · {ora(b.starts_at)}
          {b.locale ? ` · ${b.locale}` : ""}
        </p>

        {/* Il QR: è quello che si fa leggere in porta */}
        <div className="relative mt-7 border border-white/10 bg-white/[0.03] px-5 py-7">
          <div className="flex justify-center">
            <div className={annullato || usato ? "opacity-30 grayscale" : ""}>
              <canvas ref={canvasRef} className="rounded-sm" />
            </div>
          </div>

          <p className="mt-6 text-center font-display text-2xl uppercase leading-none text-white">
            {b.nome} {b.cognome}
          </p>
          <p className="mt-2 text-center font-tech text-[11px] uppercase tracking-[0.2em] text-brand-gray">
            {b.tier_label} · {Number(b.prezzo).toFixed(0)} €
          </p>

          {/* Lo stato, senza giri di parole */}
          <div className="mt-6">
            {annullato ? (
              <div className="border border-white/15 px-4 py-3 text-center">
                <p className="font-tech text-[11px] uppercase tracking-[0.2em] text-brand-gray">
                  biglietto annullato
                </p>
              </div>
            ) : usato ? (
              <div className="border border-brand-red/50 bg-brand-red/10 px-4 py-4 text-center">
                <p className="font-display text-xl uppercase leading-none text-brand-red">
                  già usato
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-white/70">
                  Questo biglietto è già entrato. Vale una volta sola: una volta passato
                  in porta viene staccato e non serve più a nessuno.
                </p>
              </div>
            ) : (
              <div className="border border-emerald-400/40 bg-emerald-400/5 px-4 py-3 text-center">
                <p className="font-tech text-[11px] uppercase tracking-[0.2em] text-emerald-300">
                  valido · ti aspettiamo
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Il documento riguarda tutti, non solo i ragazzini */}
        {!annullato && (
          <div className="mt-4 border border-white/10 px-4 py-3">
            <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
              porta un documento
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-white/70">
              All&apos;ingresso serve un documento d&apos;identità valido. Vale per tutti,
              senza eccezioni: senza documento non si entra.
            </p>

            {b.under16 && (
              <div className="mt-4 border-t border-white/10 pt-3">
                <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-amber-300">
                  hai meno di 16 anni
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-white">
                  Oltre al documento serve la <strong>delega</strong>, firmata da un genitore
                  o da chi ti accompagna. Senza quella non si entra.
                </p>
                {DELEGA_UNDER16_URL ? (
                  <a
                    href={DELEGA_UNDER16_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block border border-amber-400/50 px-4 py-3 font-tech text-[10px] uppercase tracking-[0.2em] text-amber-200"
                  >
                    scarica la delega →
                  </a>
                ) : (
                  <p className="mt-2 text-[11px] leading-relaxed text-brand-gray">
                    Chiedi il modulo a chi ti ha venduto il biglietto.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {(b.indirizzo || b.citta) && (
          <p className="mt-6 text-center text-[11px] leading-relaxed text-brand-gray/70">
            {b.indirizzo}
            {b.indirizzo && b.citta ? " · " : ""}
            {b.citta}
          </p>
        )}

        <p className="mt-8 text-center text-[10px] leading-relaxed text-brand-gray/40">
          Vale per una persona sola e si usa una volta sola: al primo ingresso viene
          staccato. Uno screenshot girato a un amico non fa entrare nessuno — entra chi
          arriva per primo, l&apos;altro resta fuori.
        </p>
      </div>
    </main>
  );
}
