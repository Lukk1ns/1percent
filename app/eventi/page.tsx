"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { dataLunga, ora, type Evento } from "@/lib/eventi";

/**
 * Il calendario di tutto quello che organizziamo.
 * In programma prima, passati dopo. Gli eventi non ancora svelati
 * compaiono come punti di domanda: il server non ci manda il nome.
 */
export default function EventiPage() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [caricato, setCaricato] = useState(false);

  useEffect(() => {
    createClient()
      .rpc("events_list")
      .then(({ data, error }) => {
        if (!error && Array.isArray(data)) setEventi(data as Evento[]);
        setCaricato(true);
      });
  }, []);

  const inProgramma = eventi.filter((e) => !e.passato);
  const passati = eventi.filter((e) => e.passato);

  return (
    <main className="flex-1 px-5 py-10 max-w-2xl mx-auto w-full">
      <Link
        href="/"
        className="text-[10px] uppercase tracking-widest text-brand-gray hover:text-white transition-colors"
      >
        ← 1%
      </Link>

      <h1 className="font-display text-4xl text-brand-red mt-6 mb-1">Eventi</h1>
      <p className="text-brand-gray text-sm mb-10">
        Ogni festa ha il suo nome. Sopra c&apos;è sempre il nostro.
      </p>

      {!caricato ? (
        <p className="text-brand-gray/50 text-sm font-mono">caricamento…</p>
      ) : eventi.length === 0 ? (
        <p className="text-brand-gray/60 text-sm py-10 text-center border border-white/5">
          Niente in calendario. Per ora.
        </p>
      ) : (
        <>
          {inProgramma.length > 0 && (
            <section className="mb-12">
              <p className="text-[10px] uppercase tracking-[0.4em] text-brand-gray/50 mb-5">
                in programma
              </p>
              <div className="flex flex-col gap-3">
                {inProgramma.map((e, i) => (
                  <RigaEvento key={i} evento={e} />
                ))}
              </div>
            </section>
          )}

          {passati.length > 0 && (
            <section>
              <p className="text-[10px] uppercase tracking-[0.4em] text-brand-gray/50 mb-5">
                già successe
              </p>
              <div className="flex flex-col gap-3">
                {passati.map((e, i) => (
                  <RigaEvento key={i} evento={e} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function RigaEvento({ evento }: { evento: Evento }) {
  // Non ancora svelato: niente nome, niente pagina da aprire.
  if (!evento.svelato) {
    return (
      <div className="border border-brand-red/30 bg-brand-red/[0.03] px-5 py-5">
        <p className="text-[10px] uppercase tracking-[0.3em] text-brand-gray/50 mb-2">
          {dataLunga(evento.starts_at)}
        </p>
        <p
          className="font-display text-brand-red uppercase leading-none tracking-[0.1em]"
          style={{ fontSize: "clamp(1.8rem, 8vw, 2.6rem)" }}
        >
          ?????
        </p>
        {evento.teaser && (
          <p className="text-sm text-white/80 mt-3 leading-snug">{evento.teaser}</p>
        )}
        <p className="text-[10px] uppercase tracking-widest text-brand-gray/50 mt-3">
          si svela il {dataLunga(evento.reveal_at)}
        </p>
      </div>
    );
  }

  return (
    <Link
      href={`/eventi/${evento.slug}`}
      className={`group block border px-5 py-5 transition-all ${
        evento.passato
          ? "border-white/5 hover:border-white/20"
          : "border-white/10 hover:border-brand-red/60"
      }`}
    >
      <p className="text-[10px] uppercase tracking-[0.3em] text-brand-gray/50 mb-2">
        {dataLunga(evento.starts_at)} · {ora(evento.starts_at)}
      </p>
      <p
        className={`font-display uppercase leading-none tracking-[0.04em] transition-colors ${
          evento.passato ? "text-white/60 group-hover:text-white" : "text-white"
        }`}
        style={{ fontSize: "clamp(1.6rem, 7vw, 2.4rem)" }}
      >
        {evento.nome}
      </p>
      {evento.locale && (
        <p className="text-xs uppercase tracking-[0.2em] text-brand-gray/60 mt-2">
          {evento.locale}
          {evento.citta ? ` · ${evento.citta}` : ""}
        </p>
      )}
    </Link>
  );
}
