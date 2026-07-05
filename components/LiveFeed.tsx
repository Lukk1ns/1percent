"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAvatar } from "@/lib/avatars";

type Member = { alias: string; avatar_id: string };

export function LiveFeed() {
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    const supabase = createClient();

    supabase.rpc("recent_members", { limit_count: 4 }).then(({ data }) => {
      if (data) setMembers(data as Member[]);
    });

    const channel = supabase
      .channel("live_feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, () => {
        supabase.rpc("recent_members", { limit_count: 4 }).then(({ data }) => {
          if (data) setMembers(data as Member[]);
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (members.length === 0) return null;

  return (
    <div
      className="relative z-10 w-full max-w-xs mx-auto mt-6 animate-fade-up"
      style={{ animationDelay: "1s" }}
    >
      <p className="flex items-center gap-2 text-[9px] uppercase tracking-[0.35em] text-brand-gray/60 mb-2">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-red opacity-70" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-red" />
        </span>
        ultimi entrati
      </p>
      <div className="flex flex-col gap-1.5">
        {members.map((m, i) => (
          <div
            key={m.alias}
            className="animate-fade-up flex items-center gap-2.5 px-3 py-2 border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm"
            style={{
              opacity: 1 - i * 0.18,
              animationDelay: `${1 + i * 0.1}s`,
              clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
            }}
          >
            <span className="text-sm">{getAvatar(m.avatar_id).emoji}</span>
            <span className="text-xs text-white/70 font-mono">{m.alias}</span>
            <span className="ml-auto text-[9px] uppercase tracking-widest text-brand-red/70 font-display">1%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
