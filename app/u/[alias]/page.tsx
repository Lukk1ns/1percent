"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FOUNDING_CUTOFF } from "@/lib/volto";
import Volto from "@/components/Volto";

type PublicProfile = {
  member_number: number;
  alias: string;
  avatar_id: string | null;
  photo_blur_path: string | null;
  photo_updated_at: string | null;
  bio: string | null;
  created_at: string;
  archetype: string | null;
  poke_count: number;
  poke_rank: number;
  poked_by_me_today: boolean;
  is_me: boolean;
};

export default function ProfiloPubblicoPage() {
  const router = useRouter();
  const params = useParams<{ alias: string }>();
  const alias = decodeURIComponent(params.alias ?? "");

  const [p, setP] = useState<PublicProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/unisciti");
      return;
    }
    const { data, error } = await supabase.rpc("public_profile", { p_alias: alias });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      // O l'alias non esiste, o chi guarda non è un membro
      setNotFound(true);
      setLoading(false);
      return;
    }
    setP(row as PublicProfile);
    setLoading(false);
  }, [alias, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePoke() {
    if (!p || p.is_me || p.poked_by_me_today) return;
    setP({
      ...p,
      poke_count: Number(p.poke_count) + 1,
      poked_by_me_today: true,
    });
    const supabase = createClient();
    const { data, error } = await supabase.rpc("send_poke", {
      p_member_number: p.member_number,
    });
    if (error || (data !== "ok" && data !== "already")) {
      setP((prev) =>
        prev
          ? {
              ...prev,
              poke_count: Math.max(0, Number(prev.poke_count) - 1),
              poked_by_me_today: false,
            }
          : prev,
      );
    }
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="font-display text-brand-red text-6xl animate-pulse-glow">1%</div>
      </main>
    );
  }

  if (notFound || !p) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-brand-red text-6xl mb-4">?</p>
        <p className="text-white text-lg mb-2">Nessuno, qui.</p>
        <p className="text-brand-gray text-sm mb-6">O non esiste, o non sei dei nostri.</p>
        <button onClick={() => router.push("/membri")} className="btn btn-outline text-xs">
          ← Torna al muro
        </button>
      </main>
    );
  }

  const isFounder = new Date(p.created_at) < new Date(FOUNDING_CUTOFF);
  const showRank = Number(p.poke_count) > 0;

  return (
    <main className="flex-1 flex flex-col items-center px-4 py-10 w-full max-w-md mx-auto">
      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-6">membro dell&apos;1%</p>

      {/* Il volto */}
      <Volto
        photoBlurPath={p.photo_blur_path}
        photoUpdatedAt={p.photo_updated_at}
        avatarId={p.avatar_id}
        size={160}
        alt={p.alias}
        className={p.photo_blur_path ? "border border-brand-red/40" : ""}
      />

      <h1 className="text-white font-mono text-2xl mt-4">{p.alias}</h1>
      <p className="text-brand-gray/60 text-xs font-mono mt-1">#{p.member_number}</p>

      {/* Badge */}
      <div className="flex gap-2 mt-3">
        {isFounder && (
          <span className="px-2 py-1 text-[9px] uppercase tracking-widest border border-brand-red/50 text-brand-red">
            founder
          </span>
        )}
        {p.archetype && (
          <span className="px-2 py-1 text-[9px] uppercase tracking-widest border border-white/15 text-brand-gray">
            {p.archetype}
          </span>
        )}
      </div>

      {/* Bio */}
      {p.bio && (
        <p className="text-white/80 text-sm text-center mt-5 max-w-xs italic">&ldquo;{p.bio}&rdquo;</p>
      )}

      {/* Statistiche poke */}
      <div className="flex items-center gap-8 mt-8">
        <div className="flex flex-col items-center">
          <span className="font-display text-brand-red text-3xl" style={{ textShadow: "0 0 12px rgba(224,24,31,0.4)" }}>
            {p.poke_count}
          </span>
          <span className="text-[9px] uppercase tracking-widest text-brand-gray/60 mt-1">poke 👊</span>
        </div>
        {showRank && (
          <div className="flex flex-col items-center">
            <span className="font-display text-white text-3xl">#{p.poke_rank}</span>
            <span className="text-[9px] uppercase tracking-widest text-brand-gray/60 mt-1">in classifica</span>
          </div>
        )}
        <div className="flex flex-col items-center">
          <span className="font-display text-white text-3xl">
            {new Date(p.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
          </span>
          <span className="text-[9px] uppercase tracking-widest text-brand-gray/60 mt-1">dentro dal</span>
        </div>
      </div>

      {/* Azioni */}
      {p.is_me ? (
        <div className="flex flex-col items-center mt-8 w-full">
          <p className="text-brand-gray/60 text-[11px] text-center mb-3">
            È così che ti vedono gli altri.
          </p>
          <button onClick={() => router.push("/profilo")} className="btn btn-outline w-full">
            Modifica il tuo profilo
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center mt-8 w-full gap-3">
          <button
            onClick={handlePoke}
            disabled={p.poked_by_me_today}
            className={`btn w-full ${p.poked_by_me_today ? "btn-outline opacity-40 cursor-default" : "btn-primary"}`}
          >
            {p.poked_by_me_today ? "✓ pokato oggi" : "👊 Poke"}
          </button>
          <p className="text-brand-gray/40 text-[10px] uppercase tracking-widest">
            messaggi — presto
          </p>
        </div>
      )}

      {/* Nav bottom */}
      <nav className="w-full mt-10 pt-6 border-t border-white/5 flex justify-around text-[10px] uppercase tracking-widest text-brand-gray/50">
        <button onClick={() => router.push("/")} className="hover:text-brand-gray transition-colors">Home</button>
        <button onClick={() => router.push("/card")} className="hover:text-brand-gray transition-colors">Card</button>
        <button onClick={() => router.push("/membri")} className="hover:text-brand-gray transition-colors">Muro</button>
        <button onClick={() => router.push("/profilo")} className="hover:text-brand-gray transition-colors">Profilo</button>
        <button onClick={() => router.push("/invita")} className="hover:text-brand-gray transition-colors">Invita</button>
      </nav>
    </main>
  );
}
