"use client";

import { useEffect, useRef, useState } from "react";
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
  quiz_answers?: { archetype?: string };
};

export default function CardPage() {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/unisciti"); return; }

      const { data } = await supabase
        .from("profiles")
        .select("member_number,alias,avatar_id,referral_code,created_at,quiz_answers")
        .eq("id", user.id)
        .single();

      if (!data) { router.replace("/unisciti"); return; }
      setProfile(data as Profile);
      setLoading(false);
    })();
  }, [router]);

  async function handleSaveCard() {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#0a0a0a",
        scale: 3,
        useCORS: true,
      });

      // Su mobile usa Web Share API con il file immagine
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], "1percent-card.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: "La mia card 1%" });
        } else {
          // Fallback desktop: download diretto
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "1percent-card.png";
          a.click();
          URL.revokeObjectURL(url);
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }, "image/png");
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleShareLink() {
    const url = `${window.location.origin}/unisciti?ref=${profile?.referral_code}`;
    if (navigator.share) {
      await navigator.share({ title: "1% — not for everyone", url });
    } else {
      await navigator.clipboard.writeText(url);
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
  const archetype = profile.quiz_answers?.archetype;

  return (
    <main className="flex-1 flex flex-col items-center px-4 py-8">

      {/* Card — ottimizzata per screenshot/salvataggio */}
      <div
        ref={cardRef}
        className="w-full max-w-sm relative flex flex-col justify-between p-7 border border-brand-red/50 overflow-hidden"
        style={{
          aspectRatio: "3/4",
          background: "linear-gradient(145deg, #0f0101 0%, #1a0303 50%, #0a0a0a 100%)",
          boxShadow: "0 0 60px rgba(224,24,31,0.2), inset 0 0 60px rgba(224,24,31,0.03)",
        }}
      >
        {/* Griglia decorativa di sfondo */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(#e0181f 1px, transparent 1px), linear-gradient(90deg, #e0181f 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
          aria-hidden
        />

        {/* Glow centrale */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 50% 55%, rgba(224,24,31,0.12), transparent 65%)",
          }}
          aria-hidden
        />

        {/* Top bar */}
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-brand-gray/70">Membro</p>
            <p className="font-display text-brand-red text-3xl leading-tight">{memberNum}</p>
          </div>
          <span className="font-display text-brand-red text-5xl leading-none">1%</span>
        </div>

        {/* Avatar centrale */}
        <div className="relative flex flex-col items-center gap-3">
          <div
            className="w-28 h-28 flex items-center justify-center text-6xl border border-brand-red/40"
            style={{
              background:
                "radial-gradient(circle, rgba(224,24,31,0.15) 0%, rgba(224,24,31,0.02) 100%)",
              boxShadow: "0 0 30px rgba(224,24,31,0.15)",
            }}
          >
            {avatar.emoji}
          </div>
          <h2
            className="font-display text-white"
            style={{ fontSize: "clamp(1.5rem, 8vw, 2rem)", letterSpacing: "0.05em" }}
          >
            {profile.alias}
          </h2>
          {archetype && (
            <p className="text-[10px] uppercase tracking-[0.25em] text-brand-red/80">{archetype}</p>
          )}
          {/* Linea decorativa */}
          <div className="w-12 h-px bg-brand-red/40" />
        </div>

        {/* Bottom */}
        <div className="relative flex items-end justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-[0.25em] text-brand-gray/60 mb-0.5">Dal</p>
            <p className="text-xs text-white/80 font-light">{memberSince}</p>
            <p className="text-[9px] uppercase tracking-[0.15em] text-brand-gray/50 mt-1">
              {VENUE_NAME}
            </p>
          </div>
          <p className="text-[9px] uppercase tracking-[0.3em] text-brand-red/70">
            not for<br />everyone
          </p>
        </div>

        {/* Watermark % grande */}
        <span
          className="absolute -bottom-4 -right-4 font-display leading-none select-none pointer-events-none"
          style={{ fontSize: "11rem", color: "rgba(224,24,31,0.04)" }}
          aria-hidden
        >
          %
        </span>

        {/* Angoli decorativi */}
        <span className="absolute top-0 left-0 w-3 h-3 border-t border-l border-brand-red/60" aria-hidden />
        <span className="absolute top-0 right-0 w-3 h-3 border-t border-r border-brand-red/60" aria-hidden />
        <span className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-brand-red/60" aria-hidden />
        <span className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-brand-red/60" aria-hidden />
      </div>

      {/* Azioni */}
      <div className="w-full max-w-sm mt-6 flex flex-col gap-3">
        <button
          onClick={handleSaveCard}
          disabled={saving}
          className="w-full bg-brand-red py-4 text-sm font-semibold uppercase tracking-widest text-white hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
        >
          {saving ? "Preparazione…" : saved ? "Salvata ✓" : "Salva card"}
        </button>
        <button
          onClick={() => router.push("/pass")}
          className="w-full border border-brand-red text-brand-red py-4 text-sm font-semibold uppercase tracking-widest hover:bg-brand-red hover:text-white transition-all"
        >
          Pass estrazione →
        </button>
        <button
          onClick={handleShareLink}
          className="w-full border border-white/10 text-brand-gray py-4 text-sm uppercase tracking-widest hover:border-white/30 transition-all"
        >
          Porta un altro 1%
        </button>
      </div>

      {/* Nav bottom */}
      <nav className="w-full max-w-sm mt-8 pt-6 border-t border-white/5 flex justify-around text-[10px] uppercase tracking-widest text-brand-gray/50">
        <button onClick={() => router.push("/")} className="hover:text-brand-gray transition-colors">Home</button>
        <button onClick={() => router.push("/card")} className="text-brand-red">Card</button>
        <button onClick={() => router.push("/pass")} className="hover:text-brand-gray transition-colors">Pass</button>
        <button onClick={() => router.push("/invita")} className="hover:text-brand-gray transition-colors">Invita</button>
      </nav>
    </main>
  );
}
