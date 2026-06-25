"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getAvatar } from "@/lib/avatars";
import { drawPrize, type Prize } from "@/lib/prizes";

type ScanResult = {
  ok: boolean;
  reason?: string;
  alias?: string;
  avatar_id?: string;
  member_number?: number;
  prize?: Prize | null;
};

function ScanContent() {
  const router = useRouter();
  const params = useSearchParams();
  const tokenFromUrl = params.get("token");

  const scannerRef = useRef<unknown>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scannerReady, setScannerReady] = useState(false);

  async function processToken(token: string) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("checkin", { p_token: token });
    if (error) {
      setResult({ ok: false, reason: "error" });
    } else {
      const checkin = data as { ok: boolean; reason?: string; alias?: string; avatar_id?: string; member_number?: number };
      setResult({
        ...checkin,
        prize: checkin.ok ? drawPrize() : undefined,
      });
    }
    setTimeout(() => {
      setResult(null);
      router.replace("/admin/scan");
    }, 6000);
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

  return (
    <main className="flex-1 flex flex-col items-center px-6 py-8">
      <div className="w-full max-w-xs flex items-center justify-between mb-8">
        <h1 className="font-display text-brand-red text-3xl">Estrazione</h1>
        <button
          onClick={handleLogout}
          className="text-xs text-brand-gray uppercase tracking-widest border border-white/10 px-3 py-1"
        >
          Esci
        </button>
      </div>

      {result && (
        <div
          className={`w-full max-w-xs p-6 mb-6 border text-center animate-fade-up ${
            result.ok
              ? "border-brand-red bg-brand-red/10"
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

              {result.prize ? (
                <>
                  <p className="text-brand-red text-xs uppercase tracking-widest mt-4 mb-2">Ha vinto</p>
                  <p style={{ fontSize: "4rem", lineHeight: 1 }}>{result.prize.emoji}</p>
                  <p className="font-display text-white text-3xl mt-2 tracking-widest">
                    {result.prize.label}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-brand-gray text-xs uppercase tracking-widest mt-4 mb-1">Nessun premio</p>
                  <p className="text-4xl mt-1">😔</p>
                  <p className="text-brand-gray/60 text-xs mt-2">Ci riprova alla prossima serata</p>
                </>
              )}
            </>
          ) : (
            <>
              <p className="text-white/50 text-4xl mb-2">✗</p>
              <p className="text-white font-semibold">
                {result.reason === "already_checked_in"
                  ? "QR già utilizzato"
                  : result.reason === "not_found"
                    ? "QR non trovato"
                    : "Errore"}
              </p>
              {result.alias && (
                <p className="text-brand-gray text-sm mt-1">{result.alias}</p>
              )}
            </>
          )}
        </div>
      )}

      {!result && !tokenFromUrl && (
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
            Scansiona il QR del membro per estrarre il premio.
          </p>
        </>
      )}

      {tokenFromUrl && !result && (
        <p className="text-brand-gray text-sm animate-pulse-glow">
          Estrazione in corso…
        </p>
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
