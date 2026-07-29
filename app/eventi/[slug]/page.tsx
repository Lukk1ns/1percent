"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { createClient } from "@/lib/supabase/client";
import { dataLunga, ora, type EventoSvelato } from "@/lib/eventi";

/**
 * La scheda di un singolo evento.
 * Solo gli eventi già svelati hanno un indirizzo pubblico: quelli
 * ancora nascosti non sono raggiungibili nemmeno indovinando l'URL,
 * perché la funzione del server li esclude.
 */
export default function EventoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [evento, setEvento] = useState<EventoSvelato | null>(null);
  const [caricato, setCaricato] = useState(false);

  useEffect(() => {
    createClient()
      .rpc("event_by_slug", { p_slug: slug })
      .then(({ data, error }) => {
        if (!error && data) setEvento(data as EventoSvelato);
        setCaricato(true);
      });
  }, [slug]);

  if (!caricato) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-brand-gray/50 text-sm font-mono">caricamento…</p>
      </main>
    );
  }

  if (!evento) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-5xl text-brand-red mb-4">?</p>
        <p className="text-brand-gray text-sm mb-8">
          Questo evento non esiste, o non è ancora stato svelato.
        </p>
        <Link href="/eventi" className="btn btn-outline">
          Vedi il calendario
        </Link>
      </main>
    );
  }

  return (
    <main className="flex-1 px-5 py-10 max-w-2xl mx-auto w-full">
      <Link
        href="/eventi"
        className="text-[10px] uppercase tracking-widest text-brand-gray hover:text-white transition-colors"
      >
        ← Eventi
      </Link>

      <div className="mt-10 text-center">
        <p
          className="font-display shine-text uppercase leading-none tracking-[0.04em]"
          style={{ fontSize: "clamp(2.4rem, 12vw, 5rem)" }}
        >
          {evento.nome}
        </p>
        <p className="text-[10px] uppercase tracking-[0.4em] text-brand-gray/60 mt-2">by 1%</p>
      </div>

      <div className="mt-10 flex flex-col items-center gap-2 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-white">
          {dataLunga(evento.starts_at)}
        </p>
        <p className="text-sm text-brand-gray">
          dalle {ora(evento.starts_at)}
          {evento.ends_at ? ` alle ${ora(evento.ends_at)}` : ""}
        </p>
        {evento.locale && (
          <p className="text-xs uppercase tracking-[0.25em] text-brand-gray/70 mt-3">
            {evento.locale}
            {evento.citta ? ` · ${evento.citta}` : ""}
          </p>
        )}
        {evento.indirizzo && (
          <p className="text-xs text-brand-gray/50">{evento.indirizzo}</p>
        )}
      </div>

      {!evento.passato && (
        <div className="mt-10 flex justify-center">
          <Countdown
            target={new Date(evento.starts_at)}
            end={evento.ends_at ? new Date(evento.ends_at) : undefined}
            sottotitoloAperti="Tu sai dove sei."
            testoDopo="Finita. Ci si vede alla prossima."
          />
        </div>
      )}

      {evento.descrizione && (
        <p className="mt-12 text-sm text-brand-gray leading-relaxed whitespace-pre-wrap">
          {evento.descrizione}
        </p>
      )}

      <div className="mt-12 flex flex-col items-center gap-3">
        <Link href="/unisciti" className="btn btn-primary w-full sm:w-auto px-10">
          Iscriviti o unisciti a noi
        </Link>
        <Link
          href="/login"
          className="text-xs uppercase tracking-widest text-brand-gray hover:text-white transition-colors"
        >
          Già dell&apos;1%? Rientra →
        </Link>
      </div>
    </main>
  );
}
