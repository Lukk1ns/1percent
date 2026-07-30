"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BUCKET_NITIDA, locandinaSfocataUrl } from "@/lib/locandina";

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
 */
export default function Locandina({ coverKey, coverV, nome, className = "" }: Props) {
  const [nitida, setNitida] = useState<string | null>(null);
  const [controllato, setControllato] = useState(false);
  // Serve a dire la cosa giusta a chi è già dentro: a lui non si chiede
  // di iscriversi, gli si dice che la foto non è arrivata.
  const [loggato, setLoggato] = useState(false);

  useEffect(() => {
    if (!coverKey) return;
    let vivo = true;

    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (vivo) setControllato(true);
        return;
      }
      if (vivo) setLoggato(true);
      // Chi decide è il server: la firma arriva solo a chi ha un profilo
      // (o allo staff). Se non è dei nostri, qui torna un errore e resta
      // la versione sfocata — il controllo non è nel browser.
      const { data: firmata } = await supabase.storage
        .from(BUCKET_NITIDA)
        .createSignedUrl(coverKey, 3600);
      if (!vivo) return;
      setNitida(firmata?.signedUrl ?? null);
      setControllato(true);
    })();

    return () => {
      vivo = false;
    };
  }, [coverKey]);

  if (!coverKey) return null;

  const sfocata = locandinaSfocataUrl(coverKey, coverV);

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

      {nitida ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={nitida}
          alt={`Locandina di ${nome}`}
          className="relative h-full w-full object-contain"
        />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sfocata}
            alt={`Locandina di ${nome}, sfocata`}
            className="relative h-full w-full object-contain"
          />
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
