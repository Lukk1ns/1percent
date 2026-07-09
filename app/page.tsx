"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { MemberCounter } from "@/components/MemberCounter";
import { EntrySequence } from "@/components/EntrySequence";
import { LiveFeed } from "@/components/LiveFeed";
import { PostitBoard } from "@/components/PostitBoard";
import { PostForm } from "@/components/PostForm";
import { Marquee } from "@/components/Marquee";
import { getAvatar } from "@/lib/avatars";
import { createClient } from "@/lib/supabase/client";
import {
  EVENT_DATE,
  EVENT_END,
  EVENT_PAYOFF,
  SIGNUPS_OPEN,
  VENUE_CITY,
  VENUE_NAME,
} from "@/lib/event";

const TICKER = SIGNUPS_OPEN
  ? [
      "08.07 il nuovo mercoledì 1%",
      "partecipa all'estrazione nell'area benvenuto e ritira il tuo regalo",
    ]
  : [
      "1% · not for everyone",
      "iscrizioni chiuse al momento — tieni d'occhio i nostri canali",
    ];

export default function LandingPage() {
  const [entered, setEntered] = useState(false);
  const [showForm, setShowForm] = useState(false);
  // null = ancora da verificare, true/false = esito controllo login
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [me, setMe] = useState<{ alias: string; avatar_id: string | null } | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  // Parte dall'interruttore master: se è chiuso a codice, resta chiuso sempre.
  // Se è aperto, il server (RPC) può comunque chiuderlo al volo.
  const [signupsOpen, setSignupsOpen] = useState(SIGNUPS_OPEN);
  const handleDone = useCallback(() => setEntered(true), []);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!SIGNUPS_OPEN) return; // chiuso a codice: non interrogo nemmeno il server
    createClient()
      .rpc("signups_open")
      .then(({ data, error }) => {
        if (!error && data === false) setSignupsOpen(false);
      });
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsMember(false); return; }
      const [{ data }, staffRes] = await Promise.all([
        supabase.from("profiles").select("alias,avatar_id").eq("id", user.id).single(),
        supabase.rpc("am_i_staff"),
      ]);
      setIsMember(Boolean(data));
      if (data) setMe(data as { alias: string; avatar_id: string | null });
      setIsStaff(Boolean(staffRes.data));
    })();
  }, []);

  const handleLogout = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setMe(null);
    setIsMember(false);
    window.location.reload();
  }, []);

  // Spotlight che segue il puntatore (desktop) — solo variabili CSS, zero re-render
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const el = mainRef.current;
    if (!el || e.pointerType !== "mouse") return;
    el.style.setProperty("--spot-x", `${e.clientX}px`);
    el.style.setProperty("--spot-y", `${e.clientY}px`);
  }, []);

  const dateLabel = EVENT_DATE.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      {!entered && <EntrySequence onDone={handleDone} />}
      {entered && <PostitBoard />}
      {showForm && <PostForm onClose={() => setShowForm(false)} />}

      <main
        ref={mainRef}
        onPointerMove={handlePointerMove}
        className={`relative flex-1 flex flex-col overflow-hidden transition-opacity duration-700 ${entered ? "opacity-100" : "opacity-0"}`}
      >
        {/* Glow rosso centrale */}
        <div
          className="pointer-events-none absolute inset-0 animate-pulse-glow"
          style={{
            background:
              "radial-gradient(circle at 50% 35%, rgba(224,24,31,0.20), transparent 60%)",
          }}
          aria-hidden
        />

        {/* Spotlight che segue il mouse */}
        <div
          className="pointer-events-none absolute inset-0 hidden sm:block"
          style={{
            background:
              "radial-gradient(360px circle at var(--spot-x, 50%) var(--spot-y, 35%), rgba(224,24,31,0.10), transparent 70%)",
          }}
          aria-hidden
        />

        {/* Barra utente loggato (in alto a destra) */}
        {entered && (me || isStaff) && (
          <div className="absolute top-3 right-3 z-30 flex items-center gap-2 animate-fade-up">
            {isStaff && (
              <Link
                href="/admin/scan"
                className="text-[10px] uppercase tracking-widest text-brand-red border border-brand-red bg-black/70 px-2.5 py-2 hover:bg-brand-red hover:text-white transition-all"
              >
                🎁 Scanner
              </Link>
            )}
            {me && (
              <Link
                href="/card"
                className="flex items-center gap-2 border border-white/10 bg-black/70 backdrop-blur px-3 py-1.5"
              >
                <span className="text-lg leading-none">{getAvatar(me.avatar_id ?? "").emoji}</span>
                <span className="text-xs text-white font-semibold max-w-[100px] truncate">{me.alias}</span>
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="text-[10px] uppercase tracking-widest text-brand-gray border border-white/10 bg-black/70 px-2.5 py-2 hover:text-white transition-colors"
            >
              Esci
            </button>
          </div>
        )}

        {/* Ticker in alto */}
        <div className="animate-fade-up">
          <Marquee items={TICKER} />
        </div>

        {/* Contenuto centrale */}
        <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
          <p className="relative z-10 text-xs sm:text-sm uppercase tracking-[0.4em] text-brand-gray animate-fade-up">
            {EVENT_PAYOFF}
          </p>

          {/* Logo "1%" — glow + glitch cromatico */}
          <h1
            className="glitch font-display relative z-10 mt-2 animate-fade-up leading-none select-none"
            data-text="1%"
            aria-label="1%"
            style={{
              animationDelay: "0.1s",
              fontSize: "clamp(6rem, 27vw, 15rem)",
              color: "#E0181F",
              letterSpacing: "-0.02em",
              textShadow:
                "0 0 8px rgba(224,24,31,0.9), 0 0 28px rgba(224,24,31,0.6), 0 0 64px rgba(224,24,31,0.35)",
            }}
          >
            1%
          </h1>

          {/* Data evento — solo a iscrizioni aperte (con serata programmata) */}
          {signupsOpen && (
            <div
              className="relative z-10 mt-4 animate-fade-up"
              style={{ animationDelay: "0.2s" }}
            >
              <p
                className="font-display shine-text uppercase tracking-[0.12em]"
                style={{ fontSize: "clamp(1.4rem, 6vw, 2.8rem)" }}
              >
                Mercoledì 8 Luglio
              </p>
            </div>
          )}

          {/* Claim con typewriter */}
          <div
            className="relative z-10 mt-3 animate-fade-up"
            style={{ animationDelay: "0.25s" }}
          >
            <p className="typewriter text-lg sm:text-xl mx-auto" style={{ maxWidth: "22ch" }}>
              Il 99% resterà a casa.
            </p>
          </div>

          {/* Countdown — solo a iscrizioni aperte */}
          {signupsOpen && (
            <div
              className="relative z-10 mt-10 animate-fade-up"
              style={{ animationDelay: "0.5s" }}
            >
              <Countdown target={EVENT_DATE} end={EVENT_END} />
            </div>
          )}

          {isMember ? (
            <div
              className="relative z-10 mt-10 flex flex-col items-center gap-3 animate-fade-up sm:flex-row"
              style={{ animationDelay: "0.65s" }}
            >
              <Link href="/card" className="btn btn-primary">
                La tua card
              </Link>
              <Link href="/pass" className="btn btn-outline">
                Il tuo pass
              </Link>
              <Link href="/membri" className="btn btn-outline">
                Il muro 👊
              </Link>
              <Link href="/profilo" className="btn btn-outline">
                Il tuo profilo
              </Link>
              <Link href="/invita" className="btn btn-ghost">
                Invita
              </Link>
            </div>
          ) : signupsOpen ? (
            <Link
              href="/unisciti"
              className="btn btn-primary cta-pulse relative z-10 mt-10 animate-fade-up px-10 py-5 text-base"
              style={{ animationDelay: "0.65s" }}
            >
              Ci sei o no?
            </Link>
          ) : (
            <div
              className="relative z-10 mt-10 animate-fade-up border border-brand-red/40 bg-black/60 px-8 py-5 text-center"
              style={{ animationDelay: "0.65s" }}
            >
              <p className="text-sm uppercase tracking-[0.25em] text-brand-red font-semibold">
                🔒 Iscrizioni chiuse al momento
              </p>
              <p className="text-xs text-brand-gray mt-2">
                Il 1% tornerà. Tieni d&apos;occhio i nostri canali.
              </p>
            </div>
          )}

          <div className="relative z-10 animate-fade-up" style={{ animationDelay: "0.8s" }}>
            <MemberCounter />
          </div>

          <LiveFeed />

          {!isMember && (
            <Link
              href="/login"
              className="relative z-10 mt-6 text-xs uppercase tracking-widest text-brand-gray hover:text-white transition-colors animate-fade-up"
              style={{ animationDelay: "1.1s" }}
            >
              Già dell&apos;1%? Rientra →
            </Link>
          )}

          <button
            onClick={() => setShowForm(true)}
            className="group relative z-10 mt-8 animate-fade-up"
            style={{ animationDelay: "1.2s" }}
            aria-label="Lascia un segno sulla bacheca"
          >
            <span
              className="block px-6 py-4 text-black transition-transform group-hover:scale-105 group-hover:-rotate-1"
              style={{
                background: "#FFF176",
                boxShadow: "3px 4px 12px rgba(0,0,0,0.5)",
                transform: "rotate(-2deg)",
                fontFamily: "var(--font-caveat)",
                fontSize: "1.35rem",
                lineHeight: 1.1,
              }}
            >
              ✏️ Lascia un segno
              <span className="block text-base text-black/60">scrivi sulla bacheca →</span>
            </span>
          </button>
        </div>

        {/* Ticker in basso (direzione opposta) + info */}
        <div className="animate-fade-up" style={{ animationDelay: "0.9s" }}>
          <p className="text-center text-[10px] uppercase tracking-widest text-brand-gray/50 mb-3">
            {dateLabel} · {VENUE_NAME} · {VENUE_CITY}
          </p>
          <Marquee items={TICKER} reverse />
        </div>
      </main>
    </>
  );
}
