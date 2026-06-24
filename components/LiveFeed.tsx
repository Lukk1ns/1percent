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
    <div className="relative z-10 w-full max-w-xs mx-auto mt-6 flex flex-col gap-1.5 animate-fade-up" style={{ animationDelay: "1s" }}>
      {members.map((m, i) => (
        <div
          key={m.alias}
          className="flex items-center gap-2 px-3 py-1.5 border border-white/5 bg-white/[0.02]"
          style={{ opacity: 1 - i * 0.18 }}
        >
          <span className="text-sm">{getAvatar(m.avatar_id).emoji}</span>
          <span className="text-xs text-white/60 font-mono">{m.alias}</span>
          <span className="ml-auto text-[9px] uppercase tracking-widest text-brand-red/60">1%</span>
        </div>
      ))}
    </div>
  );
}
