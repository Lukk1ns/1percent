"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * Avviso poke: se hai poke non ancora visti, appare un pill fisso
 * in alto che ti porta al Muro. Silenzioso in ogni altro caso
 * (non loggato, RPC non ancora installata, zero poke).
 */
export function PokeAlert() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.rpc("unseen_pokes_count");
      if (!error && typeof data === "number") setCount(data);
    })();
  }, []);

  if (count === 0) return null;

  return (
    <Link
      href="/membri?ricevuti=1"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-white border border-brand-red/60 bg-black/85 backdrop-blur-sm animate-fade-up"
      style={{
        clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))",
        boxShadow: "0 0 24px rgba(224,24,31,0.35)",
      }}
    >
      <span className="text-base">👊</span>
      Stai simpatico a qualcuno
      <span className="px-1.5 py-0.5 text-[10px] bg-brand-red rounded-full">{count}</span>
    </Link>
  );
}
