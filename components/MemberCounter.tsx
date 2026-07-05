"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function MemberCounter() {
  const [count, setCount] = useState<number | null>(null);
  const [shown, setShown] = useState(0);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    const supabase = createClient();

    supabase.rpc("member_count").then(({ data }) => {
      if (typeof data === "number") setCount(data);
    });

    // Aggiornamento live su nuovi inserimenti nella tabella profiles
    const channel = supabase
      .channel("member_count_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "profiles" },
        () => {
          supabase.rpc("member_count").then(({ data }) => {
            if (typeof data === "number") setCount(data);
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Conteggio animato: sale dal valore precedente a quello nuovo
  useEffect(() => {
    if (count === null) return;
    const from = fromRef.current;
    const start = performance.now();
    const duration = from === 0 ? 1400 : 600;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (count - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = count;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [count]);

  if (count === null) return null;

  return (
    <p className="relative z-10 mt-6 text-xs uppercase tracking-widest text-brand-gray animate-fade-up">
      <span
        className="font-display text-brand-red text-xl align-middle mr-1.5 tabular-nums"
        style={{ textShadow: "0 0 14px rgba(224,24,31,0.5)" }}
      >
        {shown}
      </span>
      {count === 1 ? "fa già parte dell'1%" : "fanno già parte dell'1%"}
    </p>
  );
}
