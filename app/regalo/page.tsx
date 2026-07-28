"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Prize = { id: string; label: string; emoji: string };
type MyPrize = { drawn: boolean; drawn_at?: string; prize?: Prize | null };
type PoolItem = { label: string; emoji: string };

const CONFETTI_COLORS = ["#e0181f", "#ffffff", "#ffb3b6", "#ffd166"];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 46 }).map(() => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 2.2 + Math.random() * 1.8,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rotate: Math.random() * 360,
      })),
    [],
  );
  return (
    <>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </>
  );
}

export default function RegaloPage() {
  const router = useRouter();
  const [mine, setMine] = useState<MyPrize | null>(null);
  const [pool, setPool] = useState<PoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [justWon, setJustWon] = useState(false);
  const [whoami, setWhoami] = useState<string | null>(null);
  const drawnRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let stopped = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    async function tick() {
      const { data } = await supabase.rpc("my_prize");
      if (stopped || !data) return;
      const mp = data as MyPrize;
      // Transizione: appena estratto → mostra reveal + coriandoli
      if (mp.drawn && !drawnRef.current) {
        drawnRef.current = true;
        if (mp.prize) setJustWon(true);
        if (interval) { clearInterval(interval); interval = undefined; }
      }
      setMine(mp);
    }

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/unisciti"); return; }
      const [poolRes, profRes] = await Promise.all([
        supabase.rpc("prize_pool"),
        supabase.from("profiles").select("alias").eq("id", user.id).single(),
      ]);
      if (poolRes.data) setPool(poolRes.data as PoolItem[]);
      setWhoami((profRes.data as { alias?: string } | null)?.alias ?? null);
      await tick();
      if (stopped) return;
      setLoading(false);
      // Continua a controllare finché non è stato estratto
      if (!drawnRef.current) interval = setInterval(tick, 3000);
    })();

    return () => { stopped = true; if (interval) clearInterval(interval); };
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
      {justWon && won && <Confetti />}

      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-2">Il tuo regalo</p>
      <h1 className="font-display text-brand-red text-5xl mb-2">1%</h1>
      <p className="text-xs text-brand-gray/60 mb-6">
        {whoami ? <>pagina di <span className="text-white font-semibold">{whoami}</span></> : "account senza profilo"}
      </p>

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
            <p className="text-brand-gray/50 text-[11px] mt-4 animate-pulse-glow">
              Tieni aperta questa pagina: il premio comparirà qui da solo.
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
