"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { MemberCounter } from "@/components/MemberCounter";
import { EntrySequence } from "@/components/EntrySequence";
import { LiveFeed } from "@/components/LiveFeed";
import { PostitBoard } from "@/components/PostitBoard";
import { PostForm } from "@/components/PostForm";
import {
  EVENT_DATE,
  EVENT_PAYOFF,
  VENUE_CITY,
  VENUE_NAME,
} from "@/lib/event";

export default function LandingPage() {
  const [entered, setEntered] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const handleDone = useCallback(() => setEntered(true), []);

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
        className={`relative flex-1 flex flex-col items-center justify-center overflow-hidden px-6 py-16 text-center transition-opacity duration-700 ${entered ? "opacity-100" : "opacity-0"}`}
      >
        {/* Glow rosso di sfondo */}
        <div
          className="pointer-events-none absolute inset-0 animate-pulse-glow"
          style={{
            background:
              "radial-gradient(circle at 50% 35%, rgba(224,24,31,0.22), transparent 60%)",
          }}
          aria-hidden
        />

        {/* Linee orizzontali decorative */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, #e0181f, #e0181f 1px, transparent 1px, transparent 60px)",
          }}
          aria-hidden
        />

        <p className="relative z-10 text-xs sm:text-sm uppercase tracking-[0.4em] text-brand-gray animate-fade-up">
          {EVENT_PAYOFF}
        </p>

        {/* Logo */}
        <div
          className="relative z-10 mt-3 animate-fade-up"
          style={{ width: "clamp(220px, 60vw, 400px)", animationDelay: "0.1s" }}
        >
          <Image
            src="/logo.png"
            alt="1%"
            width={400}
            height={400}
            priority
            className="w-full h-auto"
            style={{
              filter: "drop-shadow(0 0 30px rgba(224,24,31,0.9)) drop-shadow(0 0 80px rgba(224,24,31,0.5))",
            }}
          />
        </div>

        {/* Data evento */}
        <div
          className="relative z-10 mt-4 animate-fade-up"
          style={{ animationDelay: "0.2s" }}
        >
          <p className="font-display text-white uppercase tracking-[0.12em]" style={{ fontSize: "clamp(1.4rem, 6vw, 2.8rem)" }}>
            Mercoledì 1 Luglio
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

        <Link
          href="/unisciti"
          className="relative z-10 mt-10 inline-flex items-center gap-2 bg-brand-red px-8 py-4 text-sm font-semibold uppercase tracking-widest text-white transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(224,24,31,0.5)] active:scale-95 animate-fade-up"
          style={{ animationDelay: "0.65s" }}
        >
          Ci sei o no?
        </Link>

        <div className="relative z-10 animate-fade-up" style={{ animationDelay: "0.8s" }}>
          <MemberCounter />
        </div>

        <LiveFeed />

        <p
          className="relative z-10 mt-6 text-[10px] uppercase tracking-widest text-brand-gray/50 animate-fade-up"
          style={{ animationDelay: "0.9s" }}
        >
          {dateLabel} · {VENUE_NAME} · {VENUE_CITY}
        </p>

        <Link
          href="/login"
          className="relative z-10 mt-6 text-xs uppercase tracking-widest text-brand-gray hover:text-white transition-colors animate-fade-up"
          style={{ animationDelay: "1.1s" }}
        >
          Già dell&apos;1%? Rientra →
        </Link>

        <button
          onClick={() => setShowForm(true)}
          className="relative z-10 mt-3 text-sm text-brand-gray/70 hover:text-white transition-colors animate-fade-up"
          style={{ animationDelay: "1.2s", fontFamily: "var(--font-caveat)" }}
        >
          ✏️ lascia un segno sulla bacheca
        </button>
      </main>
    </>
  );
}
