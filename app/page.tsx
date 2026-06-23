import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { MemberCounter } from "@/components/MemberCounter";
import {
  EVENT_DATE,
  EVENT_PAYOFF,
  VENUE_CITY,
  VENUE_NAME,
} from "@/lib/event";

export default function LandingPage() {
  const dateLabel = EVENT_DATE.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <main className="relative flex-1 flex flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div
        className="pointer-events-none absolute inset-0 animate-pulse-glow"
        style={{
          background:
            "radial-gradient(circle at 50% 35%, rgba(224,24,31,0.25), transparent 60%)",
        }}
        aria-hidden
      />

      <p className="relative z-10 text-xs sm:text-sm uppercase tracking-[0.3em] text-brand-gray animate-fade-up">
        {EVENT_PAYOFF}
      </p>

      <h1
        className="relative z-10 font-display text-brand-red leading-none mt-4 animate-fade-up"
        style={{ fontSize: "clamp(6rem, 28vw, 12rem)", animationDelay: "0.1s" }}
      >
        1%
      </h1>

      <p
        className="relative z-10 max-w-sm text-lg sm:text-xl mt-2 animate-fade-up"
        style={{ animationDelay: "0.2s" }}
      >
        Il 99% resterà a casa.
      </p>

      <div className="relative z-10 mt-10 animate-fade-up" style={{ animationDelay: "0.35s" }}>
        <Countdown target={EVENT_DATE} />
      </div>

      <Link
        href="/unisciti"
        className="relative z-10 mt-12 inline-flex items-center gap-2 bg-brand-red px-8 py-4 text-sm font-semibold uppercase tracking-widest text-white transition-transform hover:scale-105 active:scale-95 animate-fade-up"
        style={{ animationDelay: "0.5s" }}
      >
        Ci sei o no?
      </Link>

      <MemberCounter />

      <p
        className="relative z-10 mt-6 text-xs uppercase tracking-widest text-brand-gray animate-fade-up"
        style={{ animationDelay: "0.6s" }}
      >
        {dateLabel} · {VENUE_NAME} · {VENUE_CITY}
      </p>
    </main>
  );
}
