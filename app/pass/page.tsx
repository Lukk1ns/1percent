"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import { getAvatar } from "@/lib/avatars";

type PassData = {
  alias: string;
  avatar_id: string;
  member_number: number;
  qr_token: string;
};

export default function PassPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [passData, setPassData] = useState<PassData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/unisciti"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("alias,avatar_id,member_number")
        .eq("id", user.id)
        .single();

      const { data: pass } = await supabase
        .from("passes")
        .select("qr_token")
        .eq("profile_id", user.id)
        .single();

      if (!profile || !pass) { router.replace("/unisciti"); return; }

      setPassData({ ...profile, qr_token: pass.qr_token } as PassData);
      setLoading(false);
    })();
  }, [router]);

  useEffect(() => {
    if (!passData || !canvasRef.current) return;
    const qrUrl = `${window.location.origin}/admin/scan?token=${passData.qr_token}`;
    QRCode.toCanvas(canvasRef.current, qrUrl, {
      width: 240,
      margin: 2,
      color: { dark: "#e0181f", light: "#0a0a0a" },
    });
  }, [passData]);

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

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-2">
        il tuo pass per l&apos;estrazione
      </p>
      <h1 className="font-display text-brand-red text-5xl mb-2">1%</h1>
      <p className="text-xs text-brand-gray/60 mb-6 max-w-xs text-center">
        Appena entri, portati all&apos;angolo accoglienza e fai scansionare il QR — potresti vincere qualcosa.
      </p>

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

      {/* Info membro */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{avatar.emoji}</span>
        <div className="text-left">
          <p className="font-semibold text-white">{passData.alias}</p>
          <p className="text-xs text-brand-gray">Membro {memberNum}</p>
        </div>
      </div>

      <p className="text-xs text-brand-gray/60 mt-4 max-w-xs text-center">
        Il QR è valido una sola volta.
      </p>

      <nav className="w-full max-w-xs mt-10 pt-6 border-t border-white/5 flex justify-around text-[10px] uppercase tracking-widest text-brand-gray/50">
        <button onClick={() => router.push("/")} className="hover:text-brand-gray transition-colors">Home</button>
        <button onClick={() => router.push("/card")} className="hover:text-brand-gray transition-colors">Card</button>
        <button onClick={() => router.push("/pass")} className="text-brand-red">Pass</button>
        <button onClick={() => router.push("/invita")} className="hover:text-brand-gray transition-colors">Invita</button>
      </nav>
    </main>
  );
}
