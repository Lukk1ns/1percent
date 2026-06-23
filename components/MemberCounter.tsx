"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function MemberCounter() {
  const [count, setCount] = useState<number | null>(null);

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

  if (count === null) return null;

  return (
    <p className="relative z-10 mt-6 text-xs uppercase tracking-widest text-brand-gray animate-fade-up">
      <span className="text-brand-red font-semibold">{count}</span>{" "}
      {count === 1 ? "fa" : "fanno"} già parte dell&apos;1%
    </p>
  );
}
