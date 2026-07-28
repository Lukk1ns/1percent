"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { createClient } from "@/lib/supabase/client";
import { dataLunga, ora, type Evento } from "@/lib/eventi";

/**
 * Il prossimo evento in homepage.
 *
 * Tre stati:
 *   · niente in programma → una riga secca, nessuna scusa
 *   · in programma ma non ancora svelato → punti di domanda e
 *     countdown al reveal. Il nome vero non è mai arrivato al browser.
 *   · svelato → nome della festa, locale, data e countdown all'inizio.
 */
export function ProssimoEvento() {
  const [evento, setEvento] = useState<Evento | null>(null);
  const [caricato, setCaricato] = useState(false);

  useEffect(() => {
    createClient()
      .rpc("next_event")
      .then(({ data, error }) => {
        // Se la tabella eventi non c'è ancora, non mostro niente e non rompo la home
        if (!error && data) setEvento(data as Evento);
        setCaricato(true);
      });
  }, []);

  if (!caricato) return null;

  if (!evento) {
    return (
      <div className="relative z-10 mt-6 animate-fade-up" style={{ animationDelay: "0.2s" }}>
        <p className="text-sm uppercase tracking-[0.3em] text-brand-gray/70">
          Niente in programma. Per ora.
        </p>
      </div>
    );
  }

  // ----------------------------------------------------------
  // Non ancora svelato
  // ----------------------------------------------------------
  if (!evento.svelato) {
    return (
      <div
        className="relative z-10 mt-4 flex flex-col items-center gap-4 animate-fade-up"
        style={{ animationDelay: "0.2s" }}
      >
        <p className="text-[10px] uppercase tracking-[0.4em] text-brand-gray/60">
          la prossima
        </p>

        <p
          className="glitch font-display uppercase leading-none select-none"
          data-text="?????"
          aria-label="Evento non ancora svelato"
          style={{
            fontSize: "clamp(2.6rem, 13vw, 6rem)",
            color: "#E0181F",
            letterSpacing: "0.08em",
            textShadow: "0 0 8px rgba(224,24,31,0.7), 0 0 34px rgba(224,24,31,0.4)",
          }}
        >
          ?????
        </p>

        {evento.teaser && (
          <p className="text-base sm:text-lg text-white/90 max-w-[26ch] text-center leading-snug">
            {evento.teaser}
          </p>
        )}

        <p className="text-sm uppercase tracking-[0.2em] text-brand-gray">
          {dataLunga(evento.starts_at)}
        </p>

        <div className="mt-4">
          <Countdown
            target={new Date(evento.reveal_at)}
            etichetta="si svela tra"
            testoDopo="Si sta svelando…"
            sottotitoloAperti="Guarda meglio."
          />
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------
  // Svelato
  // ----------------------------------------------------------
  return (
    <div
      className="relative z-10 mt-4 flex flex-col items-center gap-3 animate-fade-up"
      style={{ animationDelay: "0.2s" }}
    >
      <p className="text-[10px] uppercase tracking-[0.4em] text-brand-gray/60">la prossima</p>

      <Link href={`/eventi/${evento.slug}`} className="group flex flex-col items-center gap-1">
        <span
          className="font-display shine-text uppercase tracking-[0.06em] leading-none text-center transition-transform group-hover:scale-[1.03]"
          style={{ fontSize: "clamp(2.2rem, 11vw, 5rem)" }}
        >
          {evento.nome}
        </span>
        <span className="text-[10px] uppercase tracking-[0.35em] text-brand-gray/60">
          by 1%
        </span>
      </Link>

      <p className="text-sm uppercase tracking-[0.18em] text-brand-gray mt-2">
        {dataLunga(evento.starts_at)} · {ora(evento.starts_at)}
      </p>
      {evento.locale && (
        <p className="text-xs uppercase tracking-[0.25em] text-brand-gray/60">
          {evento.locale}
          {evento.citta ? ` · ${evento.citta}` : ""}
        </p>
      )}

      <div className="mt-6">
        <Countdown
          target={new Date(evento.starts_at)}
          end={evento.ends_at ? new Date(evento.ends_at) : undefined}
          sottotitoloAperti="Tu sai dove sei."
          testoDopo="Finita. Ci si vede alla prossima."
        />
      </div>
    </div>
  );
}
