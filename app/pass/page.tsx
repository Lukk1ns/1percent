"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import { getAvatar } from "@/lib/avatars";
import { STAND_FRASE, STAND_NON_INGRESSO } from "@/lib/event";
import { NavBasso } from "@/components/NavBasso";

type PassData = {
  alias: string;
  avatar_id: string;
  member_number: number;
  qr_token: string;
};

type Prize = { id: string; label: string; emoji: string };
type MyPrize = { drawn: boolean; drawn_at?: string; prize?: Prize | null };

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

export default function PassPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [passData, setPassData] = useState<PassData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<MyPrize | null>(null);
  const [justWon, setJustWon] = useState(false);
  const drawnRef = useRef(false);

  // Carica profilo + pass, poi controlla di continuo se è stato estratto un premio
  useEffect(() => {
    const supabase = createClient();
    let stopped = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    async function checkPrize() {
      const { data } = await supabase.rpc("my_prize");
      if (stopped || !data) return;
      const mp = data as MyPrize;
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

      const [{ data: profile }, { data: pass }] = await Promise.all([
        supabase.from("profiles").select("alias,avatar_id,member_number").eq("id", user.id).single(),
        supabase.from("passes").select("qr_token").eq("profile_id", user.id).single(),
      ]);

      if (!profile || !pass) { router.replace("/unisciti"); return; }
      if (stopped) return;

      setPassData({ ...profile, qr_token: pass.qr_token } as PassData);
      setLoading(false);
      await checkPrize();
      if (stopped) return;
      if (!drawnRef.current) interval = setInterval(checkPrize, 3000);
    })();

    return () => { stopped = true; if (interval) clearInterval(interval); };
  }, [router]);

  // Disegna il QR solo finché non è stato estratto il premio
  useEffect(() => {
    if (!passData || mine?.drawn || !canvasRef.current) return;
    const qrUrl = `${window.location.origin}/admin/scan?token=${passData.qr_token}`;
    QRCode.toCanvas(canvasRef.current, qrUrl, {
      width: 240,
      margin: 3,
      // Nero su bianco: massimo contrasto = si scansiona sempre.
      color: { dark: "#000000", light: "#ffffff" },
    });
  }, [passData, mine?.drawn]);

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="font-display text-brand-red text-6xl animate-pulse-glow">1%</div>
      </main>
    );
  }

  if (!passData) return null;

  const avatar = getAvatar(passData.avatar_id);
  const memberNum = `#${String(passData.member_number).padStart(4, "0")}`;
  const drawn = mine?.drawn;
  const won = drawn && mine?.prize;

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
      {justWon && won && <Confetti />}

      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-2">
        {drawn ? "il tuo regalo" : "il tuo QR code per lo stand"}
      </p>
      <h1 className="font-display text-brand-red text-5xl mb-2">1%</h1>

      {!drawn ? (
        <>
          <div className="mb-6 max-w-xs text-center">
            <p className="text-sm text-white leading-relaxed">{STAND_FRASE}</p>
            <p className="mt-2 text-xs text-brand-gray/70 leading-relaxed">{STAND_NON_INGRESSO}</p>
            <p className="mt-3 text-[11px] text-brand-gray/50">
              Metti la luminosità al massimo e tieni aperta questa pagina.
            </p>
          </div>

          {/* QR con cornice scanner */}
          <div
            className="relative p-5 mb-6 border border-brand-red/25 animate-fade-up"
            style={{
              background: "#0a0a0a",
              boxShadow: "0 0 40px rgba(224,24,31,0.15), inset 0 0 30px rgba(224,24,31,0.04)",
            }}
          >
            <canvas ref={canvasRef} />
            <span className="corner-blink absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-brand-red" aria-hidden />
            <span className="corner-blink absolute -top-px -right-px w-5 h-5 border-t-2 border-r-2 border-brand-red" aria-hidden style={{ animationDelay: "0.5s" }} />
            <span className="corner-blink absolute -bottom-px -left-px w-5 h-5 border-b-2 border-l-2 border-brand-red" aria-hidden style={{ animationDelay: "1s" }} />
            <span className="corner-blink absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-brand-red" aria-hidden style={{ animationDelay: "1.5s" }} />
          </div>
        </>
      ) : won ? (
        <div
          className="w-full max-w-xs border border-brand-red bg-brand-red/10 p-8 mt-4 mb-6 animate-fade-up"
          style={{ boxShadow: "0 0 60px rgba(224,24,31,0.25)" }}
        >
          <p className="text-brand-red text-xs uppercase tracking-widest mb-3">Hai vinto</p>
          <div className="relative flex items-center justify-center" style={{ height: 110 }}>
            <span className="prize-halo absolute rounded-full" aria-hidden
                  style={{ width: 150, height: 150, background: "radial-gradient(circle, rgba(224,24,31,0.45), transparent 68%)" }} />
            <p className="prize-pop relative" style={{ fontSize: "5rem", lineHeight: 1 }}>{mine!.prize!.emoji}</p>
          </div>
          <p className="label-in font-display text-white text-4xl mt-3 prize-glow">{mine!.prize!.label}</p>
          <p className="text-brand-gray/70 text-xs mt-6">Ritiralo allo stand. 🥂</p>
        </div>
      ) : (
        <div className="w-full max-w-xs border border-white/15 p-8 mt-4 mb-6 animate-fade-up">
          <p className="text-5xl mb-3">😔</p>
          <p className="text-white font-semibold">Stavolta niente premio</p>
          <p className="text-brand-gray text-sm mt-2">
            Ma sei entrato nell&apos;1%. Sarà per la prossima serata.
          </p>
        </div>
      )}

      {/* Info membro */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{avatar.emoji}</span>
        <div className="text-left">
          <p className="font-semibold text-white">{passData.alias}</p>
          <p className="text-xs text-brand-gray">Membro {memberNum}</p>
        </div>
      </div>

      {!drawn && (
        <p className="text-xs text-brand-gray/60 mt-4 max-w-xs text-center">
          Una giocata a serata. Alla prossima si rigioca.
        </p>
      )}

      {/* Il regalo non sta nella barra in fondo (sei voci bastano): chi ha
          già giocato lo ritrova da qui, oltre che qui sopra. */}
      {drawn && (
        <button
          onClick={() => router.push("/regalo")}
          className="btn btn-ghost mt-4 w-full max-w-xs"
        >
          Rivedi il tuo regalo →
        </button>
      )}

      <NavBasso />
    </main>
  );
}
