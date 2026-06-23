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

export function Countdown({ target }: { target: Date }) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(target));

  useEffect(() => {
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
    <div className="flex gap-3 sm:gap-5" role="timer" aria-live="off">
      {units.map((unit) => (
        <div key={unit.label} className="flex flex-col items-center">
          <span className="font-display text-3xl sm:text-5xl tabular-nums text-brand-red">
            {String(unit.value).padStart(2, "0")}
          </span>
          <span className="text-xs sm:text-sm uppercase tracking-widest text-brand-gray mt-1">
            {unit.label}
          </span>
        </div>
      ))}
    </div>
  );
}
