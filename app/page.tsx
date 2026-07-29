"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { ProssimoEvento } from "@/components/ProssimoEvento";
import { MemberCounter } from "@/components/MemberCounter";
import { EntrySequence } from "@/components/EntrySequence";
import { LiveFeed } from "@/components/LiveFeed";
import { PostitBoard } from "@/components/PostitBoard";
import { PostForm } from "@/components/PostForm";
import { Marquee } from "@/components/Marquee";
import { getAvatar } from "@/lib/avatars";
import { createClient } from "@/lib/supabase/client";
import { BRAND_AREA, BRAND_CLAIM, BRAND_PAYOFF, SIGNUPS_OPEN } from "@/lib/event";

const TICKER = SIGNUPS_OPEN
  ? [
      "1% · not for everyone",
      "ogni festa ha un nome · sopra c'è sempre il nostro",
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
            {BRAND_PAYOFF}
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

          {/* Chi siamo, in una riga. Il testo sta in lib/event.ts */}
          <div
            className="relative z-10 mt-3 animate-fade-up"
            style={{ animationDelay: "0.25s" }}
          >
            <p
              className="typewriter text-lg sm:text-xl mx-auto uppercase tracking-[0.15em]"
              style={{ maxWidth: "24ch" }}
            >
              {BRAND_CLAIM}
            </p>
          </div>

          {/* Prima il bottone grande, poi gli eventi sotto */}
          {isMember ? (
            <div
              className="relative z-10 mt-8 w-full max-w-md flex flex-wrap justify-center gap-2 animate-fade-up sm:max-w-2xl sm:gap-3"
              style={{ animationDelay: "0.45s" }}
            >
              <Link href="/eventi" className="btn btn-primary flex-1 min-w-[9rem]">
                Gli eventi
              </Link>
              <Link href="/pass" className="btn btn-outline flex-1 min-w-[9rem]">
                Il tuo QR code
              </Link>
              <Link href="/membri" className="btn btn-outline flex-1 min-w-[9rem]">
                Il muro 👊
              </Link>
              <Link href="/profilo" className="btn btn-outline flex-1 min-w-[9rem]">
                Il tuo profilo
              </Link>
              <Link href="/invita" className="btn btn-ghost flex-1 min-w-[9rem]">
                Invita
              </Link>
            </div>
          ) : signupsOpen ? (
            <div
              className="relative z-10 mt-8 w-full flex flex-col items-center gap-3 animate-fade-up"
              style={{ animationDelay: "0.45s" }}
            >
              <Link
                href="/unisciti"
                className="btn btn-primary cta-pulse w-full max-w-sm px-6 py-6 text-center text-sm leading-snug sm:max-w-md sm:px-10 sm:text-base"
              >
                Iscriviti o unisciti a noi
              </Link>
              <Link
                href="/login"
                className="text-[10px] uppercase tracking-widest text-brand-gray/70 hover:text-white transition-colors"
              >
                Già dell&apos;1%? Rientra →
              </Link>
            </div>
          ) : (
            <div
              className="relative z-10 mt-8 w-full max-w-sm animate-fade-up border border-brand-red/40 bg-black/60 px-6 py-5 text-center sm:max-w-md sm:px-8"
              style={{ animationDelay: "0.45s" }}
            >
              <p className="text-sm uppercase tracking-[0.25em] text-brand-red font-semibold">
                🔒 Iscrizioni chiuse al momento
              </p>
              <p className="text-xs text-brand-gray mt-2">
                Il 1% tornerà. Tieni d&apos;occhio i nostri canali.
              </p>
            </div>
          )}

          {/* Gli eventi: subito sotto il bottone */}
          <ProssimoEvento />

          {!isMember && (
            <Link
              href="/eventi"
              className="btn btn-ghost relative z-10 mt-6 w-full max-w-sm animate-fade-up sm:w-auto"
              style={{ animationDelay: "0.7s" }}
            >
              Tutti gli eventi
            </Link>
          )}

          <div className="relative z-10 animate-fade-up" style={{ animationDelay: "0.8s" }}>
            <MemberCounter />
          </div>

          <LiveFeed />

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
            1% · {BRAND_AREA}
          </p>
          <Marquee items={TICKER} reverse />
        </div>
      </main>
    </>
  );
}
