"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { locandinaSfocataUrl } from "@/lib/locandina";

type Props = {
  /** Il file della locandina, come lo manda il server. Se manca, non si mostra niente. */
  coverKey: string | null;
  /** Momento del caricamento: serve a non farsi servire la vecchia dalla cache. */
  coverV?: number | null;
  /** Nome dell'evento, per chi usa un lettore di schermo. */
  nome: string;
  className?: string;
};

/**
 * La locandina di un evento, formato storia (9:16).
 *
 * Chi è dentro la vede nitida. Chi non è iscritto vede la versione
 * sfocata — quella che il server ha ridotto a 180px prima di sfocarla,
 * quindi non c'è nessun modo di ricavarne l'originale — con il lucchetto
 * e l'invito a iscriversi.
 *
 * La nitida non arriva più come URL firmato: passa da /api/locandina/vista,
 * che ci fonde dentro il nome di chi la guarda. Se uno screenshot esce
 * prima del momento, dallo screenshot si risale a chi l'ha fatto.
 */
export default function Locandina({ coverKey, coverV, nome, className = "" }: Props) {
  // `false` = il server l'ha negata (o non è arrivata): si resta sulla
  // sfocata col lucchetto. Finché è `null` si prova a mostrarla.
  const [nitida, setNitida] = useState<false | null>(null);
  const [controllato, setControllato] = useState(false);
  // Serve a dire la cosa giusta a chi è già dentro: a lui non si chiede
  // di iscriversi, gli si dice che la foto non è arrivata.
  const [loggato, setLoggato] = useState(false);

  useEffect(() => {
    // Chi guarda lo decide il server: se non è dei nostri la route
    // risponde 403 e resta la sfocata. Qui serve solo per scrivere la
    // frase giusta sotto il lucchetto, quindi non ferma l'immagine:
    // prima si parte a scaricarla, poi eventualmente si spiega.
    let vivo = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (vivo) setLoggato(Boolean(data.user));
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (!coverKey) return null;

  const sfocata = locandinaSfocataUrl(coverKey, coverV);
  // Prima si chiedeva la nitida con un `fetch` solo per sapere se
  // arrivava, e poi la si rimetteva nell'<img>: due scaricamenti della
  // stessa immagine, con la filigrana rifatta dal server tutte e due le
  // volte. Ecco perché appariva in ritardo. Adesso parte subito dal tag,
  // e se il server dice di no si torna alla sfocata.
  const urlNitida =
    `/api/locandina/vista?key=${encodeURIComponent(coverKey)}` +
    (coverV ? `&v=${coverV}` : "");

  return (
    <div
      className={`relative overflow-hidden border border-white/10 bg-black ${className}`}
      style={{ aspectRatio: "9 / 16" }}
    >
      {/* Fasce laterali: la stessa immagine allargata, così il riquadro è sempre pieno */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sfocata}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60"
      />

      {/* La sfocata sta sotto e c'è da subito: è leggera e pubblica, quindi
          il riquadro non è mai vuoto. La nitida, quando arriva, la copre. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sfocata}
        alt={`Locandina di ${nome}, sfocata`}
        className="absolute inset-0 h-full w-full object-contain"
      />

      {nitida !== false && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={urlNitida}
          alt={`Locandina di ${nome}`}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          onError={() => {
            setNitida(false);
            setControllato(true);
          }}
          onLoad={() => setControllato(true)}
          className="relative h-full w-full object-contain"
        />
      )}

      {nitida === false && (
        <>
          {controllato && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 px-5 text-center backdrop-blur-[2px]">
              <span className="text-3xl" aria-hidden>
                🔒
              </span>
              {loggato ? (
                <>
                  <p className="font-display text-xl uppercase leading-tight text-white">
                    Non riesco
                    <br />
                    a caricarla
                  </p>
                  <p className="max-w-[22ch] text-[11px] leading-relaxed text-white/70">
                    Ricarica la pagina. Se resta così, esci e rientra: la nitida la vedono
                    i membri iscritti.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-xl uppercase leading-tight text-white">
                    La locandina
                    <br />
                    la vedono i membri
                  </p>
                  <Link
                    href="/unisciti"
                    className="mt-1 border border-brand-red bg-brand-red/90 px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.25em] text-white transition-colors hover:bg-brand-red"
                  >
                    iscriviti per vederla →
                  </Link>
                  <Link
                    href="/login"
                    className="font-tech text-[9px] uppercase tracking-[0.25em] text-white/60 hover:text-white"
                  >
                    già dentro? rientra →
                  </Link>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Texture dei moduli LED: la locandina sta sulla parete, non su un muro bianco */}
      <div className="led-grain pointer-events-none absolute inset-0 opacity-70" aria-hidden />
    </div>
  );
}
