"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getAvatar } from "@/lib/avatars";

type Prize = { id: string; label: string; emoji: string };

type ScanResult = {
  ok: boolean;
  reason?: string;
  alias?: string;
  avatar_id?: string;
  member_number?: number;
  entry?: "first" | "again";
  already?: boolean;
  prize?: Prize | null;
};

type Phase = "idle" | "rolling" | "done";

// Emoji che scorrono durante la suspense (slot-machine)
const ROLL_EMOJI = ["🛒", "🍾", "📿", "👕", "🥃", "🍹", "🔦", "📦", "🫧", "🍭", "🍬", "🎁", "⭐"];
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

function ScanContent() {
  const router = useRouter();
  const params = useSearchParams();
  const tokenFromUrl = params.get("token");

  const [phase, setPhase] = useState<Phase>("idle");
  const [rollIdx, setRollIdx] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scannerReady, setScannerReady] = useState(false);
  const busy = useRef(false);

  // Slot-machine: mentre "rolling" cicla le emoji
  useEffect(() => {
    if (phase !== "rolling") return;
    const t = setInterval(() => setRollIdx((i) => (i + 1) % ROLL_EMOJI.length), 90);
    return () => clearInterval(t);
  }, [phase]);

  async function processToken(token: string) {
    if (busy.current) return;
    busy.current = true;
    setResult(null);
    setPhase("rolling");
    const started = Date.now();

    const supabase = createClient();
    const { data, error } = await supabase.rpc("draw_prize", { p_token: token });

    // Garantisce almeno ~1.8s di suspense anche se il server risponde subito
    const wait = Math.max(0, 1800 - (Date.now() - started));
    setTimeout(() => {
      setResult(error ? { ok: false, reason: "error" } : (data as ScanResult));
      setPhase("done");
      setTimeout(() => {
        setResult(null);
        setPhase("idle");
        busy.current = false;
        router.replace("/admin/scan");
      }, 7000);
    }, wait);
  }

  useEffect(() => {
    if (tokenFromUrl) processToken(tokenFromUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromUrl]);

  useEffect(() => {
    if (tokenFromUrl) return;
    let html5Scanner: { clear: () => void } | null = null;

    import("html5-qrcode").then(({ Html5QrcodeScanner }) => {
      const scanner = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: 220, aspectRatio: 1, supportedScanTypes: [0] },
        false,
      );
      scanner.render(
        (decodedText: string) => {
          scanner.clear().catch(() => null);
          let token = decodedText;
          try {
            const url = new URL(decodedText);
            token = url.searchParams.get("token") ?? decodedText;
          } catch {
            // testo raw, usalo direttamente
          }
          processToken(token);
        },
        () => null,
      );
      html5Scanner = scanner;
      setScannerReady(true);
    });

    return () => { html5Scanner?.clear(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  const won = phase === "done" && result?.ok && result.prize;
  const nothing = phase === "done" && result?.ok && !result.prize;

  return (
    <main className="flex-1 flex flex-col items-center px-6 py-8">
      {won && !result?.already && <Confetti />}

      <div className="w-full max-w-xs flex items-center justify-between mb-8">
        <h1 className="font-display text-brand-red text-3xl">Area Benvenuto</h1>
        <button
          onClick={handleLogout}
          className="text-xs text-brand-gray uppercase tracking-widest border border-white/10 px-3 py-1"
        >
          Esci
        </button>
      </div>

      {/* SUSPENSE — slot machine */}
      {phase === "rolling" && (
        <div className="w-full max-w-xs flex flex-col items-center justify-center py-10 animate-fade-up">
          <div
            className="relative flex items-center justify-center mb-6"
            style={{ width: 140, height: 140, overflow: "hidden" }}
          >
            <span
              className="absolute inset-0 rounded-full"
              style={{ boxShadow: "inset 0 0 40px rgba(224,24,31,0.35)", border: "1px solid rgba(224,24,31,0.35)" }}
              aria-hidden
            />
            <span key={rollIdx} className="prize-roll" style={{ fontSize: "4.5rem", lineHeight: 1 }}>
              {ROLL_EMOJI[rollIdx]}
            </span>
          </div>
          <p className="text-brand-red text-xs uppercase tracking-[0.3em] animate-pulse-glow">
            Estrazione in corso…
          </p>
        </div>
      )}

      {/* REVEAL */}
      {phase === "done" && result && (
        <div
          className={`w-full max-w-xs p-6 mb-6 border text-center animate-fade-up ${
            result.ok
              ? won && !result.already
                ? "border-brand-red bg-brand-red/10"
                : "border-white/20 bg-white/5"
              : "border-white/20 bg-white/5"
          }`}
        >
          {result.ok ? (
            <>
              <p className="text-brand-gray text-xs uppercase tracking-widest mb-1">
                {result.avatar_id && getAvatar(result.avatar_id).emoji}{" "}
                <strong className="text-white">{result.alias}</strong>{" "}
                — #{String(result.member_number ?? 0).padStart(4, "0")}
              </p>

              {result.already && (
                <p className="text-yellow-500/90 text-[11px] uppercase tracking-widest mt-2">
                  ⚠ Regalo già ritirato
                </p>
              )}

              {won ? (
                <>
                  <p className="text-brand-red text-xs uppercase tracking-widest mt-4 mb-3">
                    {result.already ? "Aveva vinto" : "Ha vinto"}
                  </p>
                  <div className="relative flex items-center justify-center mb-1" style={{ height: 96 }}>
                    <span
                      className="prize-halo absolute rounded-full"
                      aria-hidden
                      style={{
                        width: 130, height: 130,
                        background: "radial-gradient(circle, rgba(224,24,31,0.5), transparent 68%)",
                      }}
                    />
                    <span className="prize-pop relative" style={{ fontSize: "4.5rem", lineHeight: 1 }}>
                      {result.prize!.emoji}
                    </span>
                  </div>
                  <p className="label-in font-display text-white text-3xl mt-2 prize-glow">
                    {result.prize!.label}
                  </p>
                  {!result.already && (
                    <p className="text-brand-gray/70 text-xs mt-4">Consegna il premio ✓</p>
                  )}
                </>
              ) : nothing ? (
                <div className="soft-shake">
                  <p className="text-brand-gray text-xs uppercase tracking-widest mt-4 mb-1">Nessun premio</p>
                  <p className="text-5xl mt-1">😔</p>
                  <p className="text-brand-gray/60 text-xs mt-2">Sarà per la prossima</p>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-white/50 text-4xl mb-2">✗</p>
              <p className="text-white font-semibold">
                {result.reason === "not_found" ? "QR non valido" : "Errore — riprova"}
              </p>
            </>
          )}
        </div>
      )}

      {/* SCANNER a riposo */}
      {phase === "idle" && !tokenFromUrl && (
        <>
          <div
            id="qr-reader"
            className="w-full max-w-xs"
            style={{ minHeight: scannerReady ? undefined : 260 }}
          />
          {!scannerReady && (
            <p className="text-brand-gray text-sm animate-pulse-glow mt-4">
              Caricamento fotocamera…
            </p>
          )}
          <p className="text-xs text-brand-gray/60 mt-4 text-center max-w-xs">
            Scansiona il QR del membro per estrarre il suo regalo.
          </p>
          <button
            onClick={() => router.push("/admin/regali")}
            className="text-xs text-brand-gray uppercase tracking-widest border border-white/10 px-4 py-2 mt-6"
          >
            Scorte & vincitori →
          </button>
        </>
      )}
    </main>
  );
}

export default function AdminScanPage() {
  return (
    <Suspense>
      <ScanContent />
    </Suspense>
  );
}
