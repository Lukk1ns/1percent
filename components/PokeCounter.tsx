"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * Contatore poke totali ricevuti, pensato per la card.
 * Sempre visibile una volta che hai almeno un poke; porta al Muro
 * già aperto sulla lista "chi ti ha pokato". Silenzioso se zero
 * o se l'RPC non è ancora installata.
 */
export function PokeCounter() {
  const [count, setCount] = useState<number | null>(null);
  const [unseen, setUnseen] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: total, error }, { data: nuovi }] = await Promise.all([
        supabase.rpc("pokes_received_count"),
        supabase.rpc("unseen_pokes_count"),
      ]);
      if (!error && typeof total === "number") setCount(total);
      if (typeof nuovi === "number") setUnseen(nuovi);
    })();
  }, []);

  if (count === null || count === 0) return null;

  return (
    <Link
      href="/membri?ricevuti=1"
      className="btn btn-outline w-full relative"
    >
      <span className="text-base">👊</span>
      Hai {count} {count === 1 ? "poke" : "poke"} — scopri chi
      {unseen > 0 && (
        <span className="ml-1 px-2 py-0.5 text-[10px] bg-brand-red text-white rounded-full animate-pulse-glow">
          {unseen} {unseen === 1 ? "nuovo" : "nuovi"}
        </span>
      )}
    </Link>
  );
}
