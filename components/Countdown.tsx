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

export function Countdown({ target }: { target: Date }) {
  // Parte da zero (uguale su server e client → niente mismatch di hydration),
  // poi al mount calcola il valore reale e avvia il tick al secondo.
  const [timeLeft, setTimeLeft] = useState(ZERO);

  useEffect(() => {
    setTimeLeft(getTimeLeft(target));
    const interval = setInterval(() => setTimeLeft(getTimeLeft(target)), 1000);
    return () => clearInterval(interval);
  }, [target]);

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
