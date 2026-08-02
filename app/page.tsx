"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import LedWall from "@/components/LedWall";
import Locandina from "@/components/Locandina";
import { Marquee } from "@/components/Marquee";
import { createClient } from "@/lib/supabase/client";
import { dataLunga, ora, type Evento } from "@/lib/eventi";
import {
  BRAND_AREA,
  BRAND_CLAIM,
  BRAND_PAYOFF,
  SOLO_SU_INVITO,
  STAND_NON_INGRESSO,
} from "@/lib/event";

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
   La home: la parete LED del locale, e sotto la prossima festa
   ──────────────────────────────────────────────────────────── */

export default function Home() {
  const [evento, setEvento] = useState<Evento | null>(null);
  const [dentro, setDentro] = useState<number | null>(null);
  const [ultimi, setUltimi] = useState<Membro[]>([]);
  // null = sto ancora controllando: evita di far lampeggiare "iscriviti"
  // a chi è già dentro
  const [io, setIo] = useState<{ alias: string; crew: boolean } | null>(null);
  const [sonoMembro, setSonoMembro] = useState<boolean | null>(null);
  const [staff, setStaff] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSonoMembro(false);
        return;
      }
      const [{ data }, staffRes] = await Promise.all([
        supabase.from("profiles").select("alias,role").eq("id", user.id).single(),
        supabase.rpc("am_i_staff"),
      ]);
      setSonoMembro(Boolean(data));
      if (data) setIo({ alias: data.alias as string, crew: data.role === "crew" });
      setStaff(Boolean(staffRes.data));
    })();
  }, []);

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

  const esci = useCallback(async () => {
    await createClient().auth.signOut();
    window.location.reload();
  }, []);

  const svelato = evento?.svelato === true ? evento : null;
  const nascosto = evento && evento.svelato === false ? evento : null;
  // Se il server non manda un evento riconoscibile, la sezione lo dice e basta
  const nessunEvento = !svelato && !nascosto;

  // Chi sta guardando. Finché il controllo non è finito non si mostra né
  // "iscriviti" né i bottoni da membro: meglio un buco per mezzo secondo
  // che chiedere l'iscrizione a uno che è già dentro.
  const controllato = sonoMembro !== null;
  // Lo staff è "dentro" anche senza profilo membro: l'account admin nella
  // tabella dei membri non c'è, e prima si beccava la pagina da visitatore.
  const haAccesso = sonoMembro === true || staff;
  // Solo a chi è davvero fuori spieghiamo perché la locandina è coperta:
  // è il motivo per cui ci si iscrive.
  const fuori = controllato && !haAccesso;

  return (
    // Fondo pieno: su questa pagina la parete sostituisce le aurore dello sfondo
    <main className="relative z-0 flex-1 bg-[#070707]">
      {/* ─────────────  LA PARETE  ───────────── */}
      <section className="relative">
        <LedWall
          testo="1%"
          videoSrc="/media/sala.mp4"
          posterSrc="/media/sala.jpg"
          cell={8}
          className="h-[64vh] min-h-[360px] w-full sm:h-[76vh]"
        />
        <h1 className="sr-only">1% — {BRAND_CLAIM}</h1>

        {/* Barra di chi è già dentro: profilo, scanner dello staff, uscita */}
        {(io || staff) && (
          <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
            {staff && (
              <Link
                href="/admin/scan"
                className="border border-brand-red bg-black/70 px-2.5 py-2 font-tech text-[9px] uppercase tracking-[0.25em] text-brand-red transition-colors hover:bg-brand-red hover:text-white"
              >
                🎁 scanner
              </Link>
            )}
            {io && (
              <Link
                href="/card"
                className="max-w-[9rem] truncate border border-white/15 bg-black/70 px-3 py-2 font-tech text-[9px] uppercase tracking-[0.25em] text-white"
              >
                {io.alias}
              </Link>
            )}
            <button
              onClick={esci}
              className="border border-white/15 bg-black/70 px-2.5 py-2 font-tech text-[9px] uppercase tracking-[0.25em] text-brand-gray transition-colors hover:text-white"
            >
              esci
            </button>
          </div>
        )}

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
      </section>

      {/* ─────────────  TICKER  ───────────── */}
      <div className="led-grain border-y border-white/5 py-1">
        <Marquee items={TICKER} />
      </div>

      {/* ─────────────  LA PROSSIMA  ─────────────
          Sta qui, subito sotto la parete: la locandina coperta è la prima
          cosa che si incontra scorrendo, ed è il motivo per iscriversi. */}
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
            <div className="led-reveal mt-5 grid gap-7 sm:grid-cols-[minmax(0,200px)_1fr] sm:items-start sm:gap-8">
              {svelato.cover_key && (
                <Locandina
                  coverKey={svelato.cover_key}
                  coverV={svelato.cover_v}
                  nome={svelato.nome}
                  className="mx-auto w-56 sm:mx-0 sm:w-full"
                />
              )}
              <div className={svelato.cover_key ? "" : "sm:col-span-2"}>
                <Link href={`/eventi/${svelato.slug}`} className="group block">
                  <span
                    className="block font-display uppercase leading-none text-white transition-colors group-hover:text-brand-red"
                    style={{ fontSize: "clamp(2rem,9vw,3.8rem)", letterSpacing: "0.02em" }}
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

                {/* A chi è fuori la locandina resta sfocata: qui gli si dice
                    perché, e come si sblocca. */}
                {fuori && svelato.cover_key && (
                  <div className="mt-6 border-l-2 border-brand-red/60 pl-4">
                    <p className="font-display text-lg uppercase leading-tight text-white sm:text-xl">
                      Vuoi vederla nitida?
                    </p>
                    {SOLO_SU_INVITO ? (
                      <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-brand-gray">
                        La locandina intera è per chi è dentro, e adesso si entra{" "}
                        <span className="text-white">solo su invito</span>: serve il link
                        di qualcuno che c&apos;è già.
                      </p>
                    ) : (
                      <>
                        <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-brand-gray">
                          La locandina intera è per chi è dentro. Trenta secondi per
                          iscriverti, nessun nome vero.
                        </p>
                        <Link href="/unisciti" className="led-cta mt-5 sm:max-w-sm">
                          Iscriviti
                        </Link>
                      </>
                    )}
                  </div>
                )}

                <div className="mt-7">
                  <CountdownLed target={new Date(svelato.starts_at)} etichetta="si apre tra" />
                </div>
              </div>
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

      {/* ─────────────  ENTRA  ───────────── */}
      <section className="led-band px-5 pb-12 pt-9 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          {!controllato ? (
            // Controllo in corso: niente. Un buco breve è meglio di un
            // "iscriviti" sbattuto in faccia a chi è già dentro.
            <div className="h-24" aria-hidden />
          ) : sonoMembro ? (
            <>
              <p className="led-label">bentornato{io ? `, ${io.alias}` : ""}</p>
              <p className="mt-4 font-display text-2xl leading-tight text-white sm:text-3xl">
                Sei dentro.<br />
                <span className="text-brand-red">Porta chi merita.</span>
              </p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                <Link href="/pass" className="btn btn-primary">Il tuo QR code</Link>
                <Link href="/invita" className="btn btn-outline">Invita qualcuno</Link>
                {io?.crew && (
                  <Link href="/tessera" className="btn btn-outline">La tua tessera crew</Link>
                )}
                <Link href="/membri" className="btn btn-ghost">Il muro</Link>
                <Link href="/profilo" className="btn btn-ghost">Il tuo profilo</Link>
              </div>
              {staff && (
                <div className="mt-6 border-t border-white/10 pt-5">
                  <p className="led-label">pannello</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <Link href="/admin/scan" className="btn btn-outline">🎁 Scanner</Link>
                    <Link href="/admin/eventi" className="btn btn-ghost">Eventi</Link>
                    <Link href="/admin/dashboard" className="btn btn-ghost">Dashboard</Link>
                  </div>
                </div>
              )}
            </>
          ) : staff ? (
            // Account di servizio: è dei nostri ma non è un membro, quindi
            // non ha card né QR. Gli si danno i suoi strumenti e basta.
            <>
              <p className="led-label">pannello</p>
              <p className="mt-4 font-display text-2xl leading-tight text-white sm:text-3xl">
                Sei entrato come staff.
              </p>
              <p className="mt-3 max-w-[46ch] text-sm leading-relaxed text-brand-gray">
                Questo account non ha una card da membro: serve a gestire. Per avere
                anche il tuo QR dello stand, iscriviti con un&apos;altra email.
              </p>
              <div className="mt-6 grid gap-2 sm:grid-cols-3">
                <Link href="/admin/scan" className="btn btn-primary">🎁 Scanner</Link>
                <Link href="/admin/eventi" className="btn btn-outline">Eventi</Link>
                <Link href="/admin/crew" className="btn btn-outline">Candidature</Link>
                <Link href="/admin/regali" className="btn btn-ghost">Regali</Link>
                <Link href="/admin/dashboard" className="btn btn-ghost">Dashboard</Link>
                <Link href="/eventi" className="btn btn-ghost">Gli eventi</Link>
              </div>
            </>
          ) : (
            <>
              <p className="led-label">entra</p>
              <p className="mt-4 font-display text-2xl leading-tight text-white sm:text-3xl">
                Il 99% guarda le storie.<br />
                <span className="text-brand-red">L&apos;1% è sulla lista.</span>
              </p>
              {SOLO_SU_INVITO ? (
                // Porta su invito: niente bottone che porterebbe a un muro
                <div className="led-reveal mt-7 border border-brand-red/40 bg-brand-red/[0.06] px-5 py-6 sm:px-7">
                  <p className="font-display text-xl uppercase leading-tight text-white sm:text-2xl">
                    Si entra solo su invito
                  </p>
                  <p className="mt-3 max-w-[42ch] text-sm leading-relaxed text-brand-gray">
                    Non ci si iscrive da soli: serve il link di chi è già dentro.
                    Fattelo mandare da chi ti ha parlato di noi.
                  </p>
                </div>
              ) : (
                <Link href="/unisciti" className="led-reveal mt-7 led-cta">
                  Iscriviti o unisciti a noi
                </Link>
              )}
              <div className="mt-4 flex flex-col gap-2 font-tech text-[10px] uppercase tracking-[0.25em] sm:flex-row sm:items-center sm:justify-between">
                <Link href="/login" className="text-brand-gray hover:text-white">
                  già dentro? rientra →
                </Link>
                {!SOLO_SU_INVITO && (
                  <span className="text-brand-gray/50">30 secondi, nessun nome vero</span>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* ─────────────  LO STAND  ───────────── */}
      <section className="led-band px-5 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <p className="led-label">lo stand</p>
          <p className="mt-4 font-display text-2xl uppercase leading-tight text-white sm:text-3xl">
            Stand <span className="text-brand-red">UNPERCENTO</span>
          </p>
          <p className="mt-3 max-w-[46ch] text-sm leading-relaxed text-brand-gray">
            A ogni serata siamo dentro il locale con il nostro banchetto. Fai scansionare
            il QR del tuo profilo: parte l&apos;estrazione e ritiri sul momento quello che
            vinci — drink, shot, magliette e altro.
          </p>
          <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-brand-gray/60">
            {STAND_NON_INGRESSO}
          </p>
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
