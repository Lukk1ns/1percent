"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { MemberCounter } from "@/components/MemberCounter";
import { EntrySequence } from "@/components/EntrySequence";
import {
  EVENT_DATE,
  EVENT_PAYOFF,
  VENUE_CITY,
  VENUE_NAME,
} from "@/lib/event";

export default function LandingPage() {
  const [entered, setEntered] = useState(false);
  const handleDone = useCallback(() => setEntered(true), []);

  const dateLabel = EVENT_DATE.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      {!entered && <EntrySequence onDone={handleDone} />}

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

        {/* Wordmark con glitch */}
        <h1
          className="glitch relative z-10 font-display text-brand-red leading-none mt-3 animate-fade-up"
          data-text="1%"
          style={{ fontSize: "clamp(6rem, 30vw, 13rem)", animationDelay: "0.1s" }}
        >
          1%
        </h1>

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

        <p
          className="relative z-10 mt-4 text-[10px] uppercase tracking-widest text-brand-gray/50 animate-fade-up"
          style={{ animationDelay: "0.9s" }}
        >
          {dateLabel} · {VENUE_NAME} · {VENUE_CITY}
        </p>
      </main>
    </>
  );
}
