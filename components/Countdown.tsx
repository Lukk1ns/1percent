"use client";

import { useEffect, useState } from "react";

function getTimeLeft(target: Date) {
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

/** Una cifra: quando cambia, React la rimonta (key) e parte l'animazione di caduta. */
function Digit({ value }: { value: string }) {
  return (
    <span key={value} className="digit-in font-display tabular-nums">
      {value}
    </span>
  );
}

const ZERO = { days: 0, hours: 0, minutes: 0, seconds: 0 };

type Phase = "before" | "open" | "after";

function getPhase(target: Date, end?: Date): Phase {
  const now = Date.now();
  if (now < target.getTime()) return "before";
  if (end && now >= end.getTime()) return "after";
  return "open";
}

/** Scritta "APERTI" che sostituisce il countdown durante la serata. */
function Aperti() {
  return (
    <div className="flex flex-col items-center gap-3 animate-fade-up">
      <span className="flex items-center gap-3 text-xs uppercase tracking-[0.4em] text-brand-gray">
        <span className="relative flex h-2.5 w-2.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-red opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-red" />
        </span>
        in questo momento
      </span>
      <span
        className="glitch font-display uppercase leading-none select-none"
        data-text="APERTI"
        style={{
          fontSize: "clamp(3rem, 14vw, 6.5rem)",
          color: "#E0181F",
          letterSpacing: "0.04em",
          textShadow:
            "0 0 8px rgba(224,24,31,0.9), 0 0 28px rgba(224,24,31,0.6), 0 0 64px rgba(224,24,31,0.35)",
        }}
      >
        APERTI
      </span>
      <span className="text-sm sm:text-base text-brand-gray">
        Il 99% è rimasto a casa. Tu sai dove andare.
      </span>
    </div>
  );
}

export function Countdown({ target, end }: { target: Date; end?: Date }) {
  // Parte da zero (uguale su server e client → niente mismatch di hydration),
  // poi al mount calcola il valore reale e avvia il tick al secondo.
  const [timeLeft, setTimeLeft] = useState(ZERO);
  const [phase, setPhase] = useState<Phase>("before");

  useEffect(() => {
    const tick = () => {
      setTimeLeft(getTimeLeft(target));
      setPhase(getPhase(target, end));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [target, end]);

  if (phase === "open") return <Aperti />;
  if (phase === "after") {
    return (
      <p className="text-sm uppercase tracking-[0.3em] text-brand-gray animate-fade-up">
        Chiuso. Al prossimo mercoledì.
      </p>
    );
  }

  const units = [
    { value: timeLeft.days, label: "giorni" },
    { value: timeLeft.hours, label: "ore" },
    { value: timeLeft.minutes, label: "min" },
    { value: timeLeft.seconds, label: "sec" },
  ];

  return (
    <div className="flex gap-1.5 sm:gap-4" role="timer" aria-live="off">
      {units.map((unit, i) => {
        const chars = String(unit.value).padStart(2, "0").split("");
        return (
          <div key={unit.label} className="flex items-center gap-1.5 sm:gap-4">
            <div className="count-cell flex flex-col items-center px-2 py-2.5 sm:px-5 sm:py-3.5 min-w-[3.4rem] sm:min-w-[5.5rem]">
              <span className="flex text-2xl sm:text-5xl text-brand-red leading-none" style={{ textShadow: "0 0 18px rgba(224,24,31,0.45)" }}>
                {chars.map((c, j) => (
                  <Digit key={`${j}-${c}`} value={c} />
                ))}
              </span>
              <span className="text-[8px] sm:text-[10px] uppercase tracking-[0.25em] text-brand-gray mt-1.5">
                {unit.label}
              </span>
            </div>
            {i < units.length - 1 && (
              <span className="font-display text-brand-red/40 text-lg sm:text-4xl animate-pulse-glow" aria-hidden>
                :
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
