"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Prize = { id: string; label: string; emoji: string };
type MyPrize = { drawn: boolean; drawn_at?: string; prize?: Prize | null };
type PoolItem = { label: string; emoji: string };

export default function RegaloPage() {
  const router = useRouter();
  const [mine, setMine] = useState<MyPrize | null>(null);
  const [pool, setPool] = useState<PoolItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/unisciti"); return; }
      const [mineRes, poolRes] = await Promise.all([
        supabase.rpc("my_prize"),
        supabase.rpc("prize_pool"),
      ]);
      if (mineRes.data) setMine(mineRes.data as MyPrize);
      if (poolRes.data) setPool(poolRes.data as PoolItem[]);
      setLoading(false);
    })();
  }, [router]);

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="font-display text-brand-red text-6xl animate-pulse-glow">1%</div>
      </main>
    );
  }

  const drawn = mine?.drawn;
  const won = drawn && mine?.prize;

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-2">Il tuo regalo</p>
      <h1 className="font-display text-brand-red text-5xl mb-6">1%</h1>

      {!drawn && (
        <>
          <div className="w-full max-w-xs border border-brand-red/25 p-8 mb-6 animate-fade-up"
               style={{ boxShadow: "0 0 40px rgba(224,24,31,0.12)" }}>
            <p className="text-6xl mb-4">🎁</p>
            <p className="text-white font-semibold mb-2">Non l&apos;hai ancora ritirato</p>
            <p className="text-brand-gray text-sm">
              Vieni all&apos;area benvenuto e fai scansionare il tuo QR:
              l&apos;estrazione parte lì, una volta sola.
            </p>
            <button
              onClick={() => router.push("/pass")}
              className="btn btn-primary mt-6 px-8"
            >
              Mostra il mio QR →
            </button>
          </div>

          {pool.length > 0 && (
            <div className="w-full max-w-xs">
              <p className="text-brand-gray text-[11px] uppercase tracking-widest mb-3">Cosa puoi vincere</p>
              <div className="flex flex-wrap justify-center gap-2">
                {pool.map((p, i) => (
                  <span key={i} className="border border-white/10 px-3 py-1.5 text-xs text-white">
                    {p.emoji} {p.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {won && (
        <div className="w-full max-w-xs border border-brand-red bg-brand-red/10 p-8 animate-fade-up"
             style={{ boxShadow: "0 0 60px rgba(224,24,31,0.25)" }}>
          <p className="text-brand-red text-xs uppercase tracking-widest mb-3">Hai vinto</p>
          <div className="relative flex items-center justify-center" style={{ height: 110 }}>
            <span className="prize-halo absolute rounded-full" aria-hidden
                  style={{ width: 150, height: 150, background: "radial-gradient(circle, rgba(224,24,31,0.45), transparent 68%)" }} />
            <p className="prize-pop relative" style={{ fontSize: "5rem", lineHeight: 1 }}>{mine!.prize!.emoji}</p>
          </div>
          <p className="label-in font-display text-white text-4xl mt-3 prize-glow">{mine!.prize!.label}</p>
          <p className="text-brand-gray/70 text-xs mt-6">
            Ritirato all&apos;area benvenuto. Goditelo. 🥂
          </p>
        </div>
      )}

      {drawn && !won && (
        <div className="w-full max-w-xs border border-white/15 p-8 animate-fade-up">
          <p className="text-5xl mb-3">😔</p>
          <p className="text-white font-semibold">Stavolta niente premio</p>
          <p className="text-brand-gray text-sm mt-2">
            Ma sei entrato nell&apos;1%, ed è già tanto. Sarà per la prossima serata.
          </p>
        </div>
      )}

      <nav className="w-full max-w-xs mt-10 pt-6 border-t border-white/5 flex justify-around text-[10px] uppercase tracking-widest text-brand-gray/50">
        <button onClick={() => router.push("/")} className="hover:text-brand-gray transition-colors">Home</button>
        <button onClick={() => router.push("/card")} className="hover:text-brand-gray transition-colors">Card</button>
        <button onClick={() => router.push("/pass")} className="hover:text-brand-gray transition-colors">Pass</button>
        <button onClick={() => router.push("/regalo")} className="text-brand-red">Regalo</button>
        <button onClick={() => router.push("/membri")} className="hover:text-brand-gray transition-colors">Muro</button>
      </nav>
    </main>
  );
}
