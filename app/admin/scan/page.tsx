"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getAvatar } from "@/lib/avatars";

type CheckinResult = {
  ok: boolean;
  reason?: string;
  alias?: string;
  avatar_id?: string;
  member_number?: number;
};

function ScanContent() {
  const router = useRouter();
  const params = useSearchParams();
  const tokenFromUrl = params.get("token");

  const scannerRef = useRef<unknown>(null);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [scannerReady, setScannerReady] = useState(false);

  async function processToken(token: string) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("checkin", { p_token: token });
    if (error) {
      setResult({ ok: false, reason: "error" });
    } else {
      setResult(data as CheckinResult);
    }
    // Reset automatico dopo 4 secondi
    setTimeout(() => {
      setResult(null);
      // Rimuovi token dall'URL senza reload
      router.replace("/admin/scan");
    }, 4000);
  }

  // Se il QR è stato scansionato con la fotocamera nativa (token in URL)
  useEffect(() => {
    if (tokenFromUrl) processToken(tokenFromUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromUrl]);

  // Scanner fotocamera in-app via html5-qrcode
  useEffect(() => {
    if (tokenFromUrl) return; // Già gestito sopra
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
          // Estrai il token dal testo (URL o token raw)
          let token = decodedText;
          try {
            const url = new URL(decodedText);
            token = url.searchParams.get("token") ?? decodedText;
          } catch {
            // Non è un URL, usa il testo direttamente
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
        <h1 className="font-display text-brand-red text-3xl">Scanner</h1>
        <button
          onClick={handleLogout}
          className="text-xs text-brand-gray uppercase tracking-widest border border-white/10 px-3 py-1"
        >
          Esci
        </button>
      </div>

      {/* Risultato checkin */}
      {result && (
        <div
          className={`w-full max-w-xs p-6 mb-6 border text-center animate-fade-up ${
            result.ok
              ? "border-green-500 bg-green-500/10"
              : "border-brand-red bg-brand-red/10"
          }`}
        >
          {result.ok ? (
            <>
              <p className="text-green-400 text-4xl mb-2">✓</p>
              <p className="text-lg mb-1">
                {result.avatar_id && getAvatar(result.avatar_id).emoji}{" "}
                <strong>{result.alias}</strong>
              </p>
              <p className="text-brand-gray text-sm">
                Membro #{String(result.member_number ?? 0).padStart(4, "0")}
              </p>
              <p className="text-green-400 text-xs uppercase tracking-widest mt-2">
                Accesso valido
              </p>
            </>
          ) : (
            <>
              <p className="text-brand-red text-4xl mb-2">✗</p>
              <p className="text-white font-semibold">
                {result.reason === "already_checked_in"
                  ? "Già entrato"
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

      {/* Camera scanner */}
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
            Punta la fotocamera sul QR del membro oppure usa la fotocamera del
            telefono e il link si aprirà qui.
          </p>
        </>
      )}

      {tokenFromUrl && !result && (
        <p className="text-brand-gray text-sm animate-pulse-glow">
          Verifica in corso…
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
