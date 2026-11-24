"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Le pagine dello stand (/pass, /regalo) quando lo stand è spento
 * (`STAND_ATTIVO` in lib/event.ts): chi ci arriva da un vecchio link
 * torna alla sua card, invece di trovare un ticket che non serve.
 */
export function StandSpento() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/card");
  }, [router]);
  return (
    <main className="flex-1 flex items-center justify-center">
      <div className="font-display text-brand-red text-6xl animate-pulse-glow">1%</div>
    </main>
  );
}
