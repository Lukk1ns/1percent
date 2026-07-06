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
import { PokeAlert } from "@/components/PokeAlert";
import { createClient } from "@/lib/supabase/client";
import {
  EVENT_DATE,
  EVENT_PAYOFF,
  VENUE_CITY,
  VENUE_NAME,
} from "@/lib/event";

const TICKER = [
  "08.07 il nuovo mercoledì 1%",
  "partecipa all'estrazione nell'area benvenuto e ritira il tuo regalo",
];

export default function LandingPage() {
  const [entered, setEntered] = useState(false);
  const [showForm, setShowForm] = useState(false);
  // null = ancora da verificare, true/false = esito controllo login
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const handleDone = useCallback(() => setEntered(true), []);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsMember(false); return; }
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();
      setIsMember(Boolean(data));
    })();
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
      {entered && <PokeAlert />}
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

          {/* Data evento */}
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

          {/* Claim con typewriter */}
          <div
            className="relative z-10 mt-3 animate-fade-up"
            style={{ animationDelay: "0.25s" }}
          >
            <p className="typewriter text-lg sm:text-xl mx-auto" style={{ maxWidth: "22ch" }}>
              Il 99% resterà a casa.
            </p>
          </div>

          <div
            className="relative z-10 mt-10 animate-fade-up"
            style={{ animationDelay: "0.5s" }}
          >
            <Countdown target={EVENT_DATE} />
          </div>

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
          ) : (
            <Link
              href="/unisciti"
              className="btn btn-primary cta-pulse relative z-10 mt-10 animate-fade-up px-10 py-5 text-base"
              style={{ animationDelay: "0.65s" }}
            >
              Ci sei o no?
            </Link>
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
