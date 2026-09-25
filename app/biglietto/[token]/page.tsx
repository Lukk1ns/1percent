"use client";

import { use, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import { graficaBigliettoUrl } from "@/lib/biglietto";
import { dataLunga, ora } from "@/lib/eventi";
import { DELEGA_UNDER16_URL, delegaPerLocale } from "@/lib/event";

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
  ticket_key: string | null;
  ticket_v: number | null;
  /** Il modulo di delega del locale dove si va: i due locali hanno società diverse. */
  delega_url: string | null;
  /** Dove appoggiare il QR sulla grafica, in percentuale dall'alto. */
  qr_pos: number | null;
};

/**
 * Il biglietto del cliente.
 *
 * È l'unica pagina pubblica del modulo: la apre chi ha ricevuto il link
 * su WhatsApp, senza iscriversi a niente. Chi non ha il token non trova
 * nulla — il token è l'indirizzo.
 *
 * Al cliente non si dice niente dei soldi: per lui il biglietto è valido
 * da subito. Che il PR abbia consegnato l'incasso è un fatto interno e si
 * legge dal pannello. Gli unici due stati che vede sono "valido" e "già
 * usato", perché sappia che al primo ingresso il biglietto viene staccato.
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
    // Se il biglietto viene usato o annullato mentre il cliente ha la
    // pagina aperta, se ne accorge da solo.
    const t = setInterval(leggi, 20000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [token]);

  useEffect(() => {
    if (!canvasRef.current || !b) return;
    QRCode.toCanvas(canvasRef.current, token, {
      width: 240,
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
  const spento = annullato || usato;
  const grafica = b.ticket_key ? graficaBigliettoUrl(b.ticket_key, b.ticket_v) : null;

  /** Il QR e il nome: appoggiati sulla grafica se c'è, da soli se manca. */
  const codice = (
    <>
      <div className={`bg-white p-2 ${spento ? "opacity-25 grayscale" : ""}`}>
        <canvas ref={canvasRef} className="block" />
      </div>
      <p className="mt-3 text-center font-display text-2xl uppercase leading-none text-white">
        {b.nome} {b.cognome}
      </p>
      <p className="mt-1.5 text-center font-tech text-[11px] uppercase tracking-[0.2em] text-brand-gray">
        {/* Un omaggio della direzione non ha un prezzo da scrivere:
            "0 €" sembrerebbe un errore, e a chi lo riceve non si dice
            quanto non ha pagato. */}
        {Number(b.prezzo) > 0 ? `${b.tier_label} · ${Number(b.prezzo).toFixed(0)} €` : b.tier_label}
      </p>
    </>
  );

  return (
    <main className="flex-1 px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
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

        {grafica ? (
          // La grafica della serata con il QR appoggiato sopra: che ne
          // copra un pezzo non è un problema, quello che conta è che il
          // codice si legga.
          <div className="relative mt-6 overflow-hidden border border-white/10 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={grafica}
              alt={`Grafica di ${b.evento}`}
              className={`block w-full ${spento ? "opacity-40 grayscale" : ""}`}
            />
            {b.qr_pos === null || b.qr_pos >= 70 ? (
              // In fondo: la sfumatura nera regge il testo sopra la foto
              <div className="absolute inset-x-0 bottom-0 flex flex-col items-center bg-gradient-to-t from-black via-black/90 to-transparent px-4 pb-5 pt-16">
                {codice}
              </div>
            ) : (
              // Appoggiato dove c'è spazio: un velo dietro, così il QR
              // si legge anche se sotto la grafica è chiara.
              //
              // `top` e `translateY` con la STESSA percentuale: a 0 il
              // blocco è attaccato in alto, a 100 in fondo, in mezzo
              // scorre restando sempre dentro l'immagine. Prima era solo
              // `top`, quindi spostandolo in basso il nome e il prezzo
              // finivano fuori e venivano tagliati — il QR "ritagliato"
              // visto da Luka il 25 set.
              <div
                className="absolute inset-x-0 flex flex-col items-center px-4"
                style={{ top: `${b.qr_pos}%`, transform: `translateY(-${b.qr_pos}%)` }}
              >
                <div className="rounded-sm bg-black/75 px-5 py-4 backdrop-blur-sm">
                  {codice}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-7 flex flex-col items-center border border-white/10 bg-white/[0.03] px-5 py-7">
            {codice}
          </div>
        )}

        {/* Lo stato: valido, oppure già bruciato */}
        <div className="mt-4">
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

        {/* Il documento riguarda tutti, non solo i ragazzini */}
        {!annullato && (
          <div className="mt-4 border border-white/10 px-4 py-3">
            <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
              porta il documento fisico
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-white/70">
              All&apos;ingresso serve il documento d&apos;identità <strong>vero, in mano</strong>:
              la foto sul telefono non vale. Vale per tutti, senza eccezioni — senza
              documento non si entra.
            </p>

            {(b.under16 || b.minorenne) && (
              <div className="mt-4 border-t border-white/10 pt-3">
                <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-amber-300">
                  {b.under16 ? "hai meno di 16 anni" : "non hai ancora 18 anni"}
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-white">
                  {b.under16 ? (
                    <>
                      Oltre al documento serve la <strong>delega</strong>, firmata da un
                      genitore o da chi ti accompagna. Senza quella non si entra.
                    </>
                  ) : (
                    <>
                      <strong>Se non hai ancora compiuto 16 anni</strong> serve anche la
                      delega, firmata da un genitore o da chi ti accompagna: senza quella
                      non si entra. Se i 16 li hai già fatti, ti basta il documento.
                    </>
                  )}
                </p>
                <a
                  href={b.delega_url || delegaPerLocale(b.locale) || DELEGA_UNDER16_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block border border-amber-400/50 px-4 py-3 font-tech text-[10px] uppercase tracking-[0.2em] text-amber-200"
                >
                  scarica il modulo →
                </a>
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
