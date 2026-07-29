"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LedWall from "@/components/LedWall";
import { Marquee } from "@/components/Marquee";
import { createClient } from "@/lib/supabase/client";
import { dataLunga, ora, type Evento } from "@/lib/eventi";
import { BRAND_AREA, BRAND_CLAIM, BRAND_PAYOFF } from "@/lib/event";

const TICKER = [
  "1% · not for everyone",
  "ogni festa ha un nome · sopra c'è sempre il nostro",
];

type Membro = { alias: string };

/* ────────────────────────────────────────────────────────────
   Countdown in stile parete: quattro moduli accesi
   ──────────────────────────────────────────────────────────── */

function mancante(target: Date) {
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    g: Math.floor(diff / 86400000),
    h: Math.floor((diff / 3600000) % 24),
    m: Math.floor((diff / 60000) % 60),
    s: Math.floor((diff / 1000) % 60),
  };
}

function CountdownLed({ target, etichetta }: { target: Date; etichetta: string }) {
  const [t, setT] = useState(() => mancante(target));

  useEffect(() => {
    const i = setInterval(() => setT(mancante(target)), 1000);
    return () => clearInterval(i);
  }, [target]);

  const celle = [
    { v: t.g, l: "giorni" },
    { v: t.h, l: "ore" },
    { v: t.m, l: "min" },
    { v: t.s, l: "sec" },
  ];

  return (
    <div>
      <p className="led-label mb-3">{etichetta}</p>
      <div className="flex gap-2 sm:gap-3">
        {celle.map((c) => (
          <div key={c.l} className="flex flex-col items-center">
            <div className="led-cell flex items-center justify-center px-3 py-3 text-2xl sm:px-5 sm:py-4 sm:text-4xl">
              {String(c.v).padStart(2, "0")}
            </div>
            <span className="mt-2 font-tech text-[9px] uppercase tracking-[0.3em] text-brand-gray/60">
              {c.l}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   La pagina
   ──────────────────────────────────────────────────────────── */

export default function NuovaHome() {
  const [evento, setEvento] = useState<Evento | null>(null);
  const [dentro, setDentro] = useState<number | null>(null);
  const [ultimi, setUltimi] = useState<Membro[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("next_event").then(({ data, error }) => {
      if (!error && data) setEvento(data as Evento);
    });
    supabase.rpc("member_count").then(({ data }) => {
      if (typeof data === "number") setDentro(data);
    });
    supabase.rpc("recent_members", { limit_count: 6 }).then(({ data }) => {
      if (Array.isArray(data)) setUltimi(data as Membro[]);
    });
  }, []);

  const svelato = evento?.svelato === true ? evento : null;
  const nascosto = evento && evento.svelato === false ? evento : null;
  // Se il server non manda un evento riconoscibile, la sezione lo dice e basta
  const nessunEvento = !svelato && !nascosto;

  return (
    // Fondo pieno: su questa pagina la parete sostituisce le aurore dello sfondo
    <main className="relative z-0 flex-1 bg-[#070707]">
      {/* ─────────────  LA PARETE  ───────────── */}
      <section className="relative">
        <LedWall
          testo="1%"
          videoSrc="/media/sala.mp4"
          posterSrc="/media/sala.jpg"
          cell={11}
          className="h-[64vh] min-h-[360px] w-full sm:h-[76vh]"
        />
        <h1 className="sr-only">1% — {BRAND_CLAIM}</h1>

        {/* Striscia di stato in fondo alla parete */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-brand-red/25 bg-black/70 px-4 py-2.5 backdrop-blur-sm sm:px-6">
          <span className="flex items-center gap-2 font-tech text-[10px] uppercase tracking-[0.3em] text-white/80">
            <span className="led-dot inline-block" aria-hidden />
            {BRAND_PAYOFF}
          </span>
          <span className="font-tech text-[10px] uppercase tracking-[0.3em] text-brand-gray/70">
            {BRAND_CLAIM}
          </span>
        </div>

        {/* Promemoria: questa è la pagina di prova */}
        <Link
          href="/"
          className="absolute right-3 top-3 border border-white/15 bg-black/70 px-2.5 py-1.5 font-tech text-[9px] uppercase tracking-[0.25em] text-brand-gray hover:text-white"
        >
          anteprima · home attuale →
        </Link>
      </section>

      {/* ─────────────  TICKER  ───────────── */}
      <div className="led-grain border-y border-white/5 py-1">
        <Marquee items={TICKER} />
      </div>

      {/* ─────────────  ENTRA  ───────────── */}
      <section className="led-band px-5 pb-12 pt-9 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <p className="led-label">entra</p>
          <p className="mt-4 font-display text-2xl leading-tight text-white sm:text-3xl">
            Il 99% guarda le storie.<br />
            <span className="text-brand-red">L&apos;1% è sulla lista.</span>
          </p>
          <Link href="/unisciti" className="led-reveal mt-7 led-cta">
            Iscriviti o unisciti a noi
          </Link>
          <div className="mt-4 flex flex-col gap-2 font-tech text-[10px] uppercase tracking-[0.25em] sm:flex-row sm:items-center sm:justify-between">
            <Link href="/login" className="text-brand-gray hover:text-white">
              già dentro? rientra →
            </Link>
            <span className="text-brand-gray/50">30 secondi, nessun nome vero</span>
          </div>
        </div>
      </section>

      {/* ─────────────  LA PROSSIMA  ───────────── */}
      <section className="led-band px-5 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <p className="led-label">la prossima</p>

          {nessunEvento && (
            <p className="mt-5 font-display text-2xl text-brand-gray/60 sm:text-3xl">
              Niente in programma. Per ora.
            </p>
          )}

          {nascosto && (
            <div className="led-reveal mt-5 grid gap-9 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-12">
              <div>
                <p
                  className="font-display leading-none text-brand-red"
                  style={{ fontSize: "clamp(3rem,15vw,6rem)", letterSpacing: "0.06em" }}
                >
                  ?????
                </p>
                {nascosto.teaser && (
                  <p className="mt-4 max-w-[28ch] text-lg leading-snug text-white/90">
                    {nascosto.teaser}
                  </p>
                )}
                <p className="mt-4 font-tech text-xs uppercase tracking-[0.3em] text-brand-gray">
                  {dataLunga(nascosto.starts_at)}
                </p>
              </div>
              <CountdownLed target={new Date(nascosto.reveal_at)} etichetta="si svela tra" />
            </div>
          )}

          {svelato && (
            <div className="led-reveal mt-5 grid gap-9 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-12">
              <div>
              <Link href={`/eventi/${svelato.slug}`} className="group block">
                <span
                  className="block font-display uppercase leading-none text-white transition-colors group-hover:text-brand-red"
                  style={{ fontSize: "clamp(2.6rem,13vw,6rem)", letterSpacing: "0.02em" }}
                >
                  {svelato.nome}
                </span>
                <span className="mt-1 block font-tech text-[10px] uppercase tracking-[0.4em] text-brand-gray/60">
                  by 1%
                </span>
              </Link>
              <p className="mt-4 font-tech text-xs uppercase tracking-[0.25em] text-brand-gray">
                {dataLunga(svelato.starts_at)} · {ora(svelato.starts_at)}
              </p>
              {svelato.locale && (
                <p className="mt-1 font-tech text-[11px] uppercase tracking-[0.25em] text-brand-gray/55">
                  {svelato.locale}
                  {svelato.citta ? ` · ${svelato.citta}` : ""}
                </p>
              )}
              </div>
              <CountdownLed target={new Date(svelato.starts_at)} etichetta="si apre tra" />
            </div>
          )}

          <Link
            href="/eventi"
            className="mt-8 inline-block border border-brand-red/40 px-5 py-3 font-tech text-[10px] uppercase tracking-[0.3em] text-white transition-colors hover:bg-brand-red/10"
          >
            tutti gli eventi →
          </Link>
        </div>
      </section>

      {/* ─────────────  DENTRO  ───────────── */}
      <section className="led-band px-5 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <p className="led-label">dentro</p>
          <div className="mt-4 flex items-end gap-4">
            <span
              className="led-digits leading-none"
              style={{ fontSize: "clamp(3.4rem,18vw,6.5rem)" }}
            >
              {dentro === null ? "—" : String(dentro).padStart(3, "0")}
            </span>
            <span className="pb-3 font-tech text-[10px] uppercase leading-relaxed tracking-[0.3em] text-brand-gray">
              persone
              <br />
              hanno la tessera
            </span>
          </div>

          {ultimi.length > 0 && (
            <p className="mt-6 font-tech text-[11px] leading-relaxed text-brand-gray/70">
              <span className="text-brand-red">ultimi:</span>{" "}
              {ultimi.map((m) => m.alias).join(" · ")}
            </p>
          )}
        </div>
      </section>

      {/* ─────────────  PIEDE  ───────────── */}
      <footer className="led-band led-grain px-5 py-10 sm:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <span className="font-display text-4xl text-brand-red">1%</span>
          <p className="font-tech text-[10px] uppercase tracking-[0.3em] text-brand-gray/60">
            {BRAND_AREA}
          </p>
          <div className="flex gap-5 font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray/60">
            <Link href="/eventi" className="hover:text-white">eventi</Link>
            <Link href="/membri" className="hover:text-white">il muro</Link>
            <Link href="/privacy" className="hover:text-white">privacy</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
