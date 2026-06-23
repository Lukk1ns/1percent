"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getAvatar } from "@/lib/avatars";
import { VENUE_NAME, VENUE_CITY } from "@/lib/event";

type Profile = {
  member_number: number;
  alias: string;
  avatar_id: string;
  referral_code: string;
  created_at: string;
};

export default function CardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/unisciti"); return; }

      const { data } = await supabase
        .from("profiles")
        .select("member_number,alias,avatar_id,referral_code,created_at")
        .eq("id", user.id)
        .single();

      if (!data) { router.replace("/unisciti"); return; }
      setProfile(data as Profile);
      setLoading(false);
    })();
  }, [router]);

  async function handleShare() {
    const url = `${window.location.origin}/unisciti?ref=${profile?.referral_code}`;
    if (navigator.share) {
      await navigator.share({ title: "1% — not for everyone", url });
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="font-display text-brand-red text-6xl animate-pulse-glow">1%</div>
      </main>
    );
  }

  if (!profile) return null;

  const avatar = getAvatar(profile.avatar_id);
  const memberSince = new Date(profile.created_at).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const memberNum = `#${String(profile.member_number).padStart(4, "0")}`;

  return (
    <main className="flex-1 flex flex-col items-center px-6 py-10">
      {/* La card — occu pa lo schermo, pensata per screenshot */}
      <div
        className="w-full max-w-sm aspect-[3/4] relative flex flex-col justify-between p-6 border border-brand-red/40"
        style={{
          background: "linear-gradient(160deg, #0a0a0a 0%, #1a0303 100%)",
          boxShadow: "0 0 40px rgba(224,24,31,0.15)",
        }}
      >
        {/* Top bar */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-brand-gray">Membro</p>
            <p className="font-display text-brand-red text-2xl">{memberNum}</p>
          </div>
          <span className="font-display text-brand-red text-4xl">1%</span>
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center">
          <div
            className="w-24 h-24 flex items-center justify-center text-5xl border border-brand-red/30 mb-4"
            style={{ background: "rgba(224,24,31,0.07)" }}
          >
            {avatar.emoji}
          </div>
          <h2 className="font-display text-3xl text-white">{profile.alias}</h2>
        </div>

        {/* Bottom */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-brand-gray">Dal</p>
            <p className="text-xs text-white">{memberSince}</p>
            <p className="text-[10px] uppercase tracking-widest text-brand-gray mt-1">
              {VENUE_NAME} · {VENUE_CITY}
            </p>
          </div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-brand-red">
            not for everyone
          </p>
        </div>

        {/* Watermark % */}
        <span
          className="absolute bottom-4 right-4 font-display text-[8rem] leading-none text-brand-red/5 select-none pointer-events-none"
          aria-hidden
        >
          %
        </span>
      </div>

      {/* Azioni */}
      <div className="w-full max-w-sm mt-8 flex flex-col gap-3">
        <button
          onClick={() => router.push("/pass")}
          className="w-full border border-brand-red text-brand-red py-4 text-sm font-semibold uppercase tracking-widest hover:bg-brand-red hover:text-white transition-all"
        >
          Il tuo pass d&apos;ingresso →
        </button>
        <button
          onClick={handleShare}
          className="w-full border border-white/10 text-brand-gray py-4 text-sm uppercase tracking-widest hover:border-white/30 transition-all"
        >
          {copied ? "Link copiato ✓" : "Porta un altro 1%"}
        </button>
      </div>
    </main>
  );
}
