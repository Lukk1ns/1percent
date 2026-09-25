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

/** Esito della registrazione presenza: dice a quale serata è stato segnato. */
type Presenza = {
  ok: boolean;
  reason?: string;
  nuova?: boolean;
  alias?: string;
  evento?: string;
  presenti?: number;
};

type Phase = "idle" | "rolling" | "done";

type TorchCap = { isSupported: () => boolean; apply: (v: boolean) => Promise<void> };
type Html5QrcodeInstance = {
  start: (
    camera: { facingMode: string } | string,
    config: object,
    onSuccess: (t: string) => void,
    onError: (e: string) => void,
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
  getRunningTrackCameraCapabilities: () => { torchFeature: () => TorchCap };
};

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
  // Il messaggio vero del telefono, non un "non funziona": senza, non si
  // capisce se manca il permesso, se la pagina non è sicura o se la
  // fotocamera è occupata da un'altra app.
  const [camError, setCamError] = useState<string | null>(null);
  // Cambia a ogni "riprova": far ripartire l'accensione da un tocco è
  // anche l'unico modo in cui certi telefoni chiedono il permesso.
  const [tentativo, setTentativo] = useState(0);
  // Esito della registrazione presenza alla serata in corso
  const [presenza, setPresenza] = useState<Presenza | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);
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
    setPresenza(null);
    setPhase("rolling");
    const started = Date.now();

    const supabase = createClient();
    // Due cose in parallelo: il regalo e la presenza alla serata di stasera.
    // La presenza è quella che conta per le tessere della crew, quindi se
    // manca lo script SQL il regalo continua a funzionare lo stesso.
    const [{ data, error }, presRes] = await Promise.all([
      supabase.rpc("draw_prize", { p_token: token }),
      supabase.rpc("registra_presenza", { p_token: token }),
    ]);
    const pres = presRes.error ? null : (presRes.data as Presenza);

    // Almeno ~1.8s di suspense anche se il server risponde subito
    const wait = Math.max(0, 1800 - (Date.now() - started));
    setTimeout(() => {
      setResult(error ? { ok: false, reason: "error" } : (data as ScanResult));
      setPresenza(pres);
      setPhase("done");
      setTimeout(() => {
        setResult(null);
        setPresenza(null);
        busy.current = false;
        setPhase("idle"); // riavvia la fotocamera
      }, 7000);
    }, wait);
  }

  // Estrae il token da un QR (URL o testo raw)
  function tokenFrom(decoded: string): string {
    try {
      const url = new URL(decoded);
      return url.searchParams.get("token") ?? decoded;
    } catch {
      return decoded;
    }
  }

  // Avvia / ferma la fotocamera in base alla fase (solo camera posteriore, nessun menù)
  useEffect(() => {
    if (tokenFromUrl) { processToken(tokenFromUrl); return; }
    if (phase !== "idle") return;

    let cancelled = false;
    setScannerReady(false);
    setCamError(null);
    setTorchOn(false);

    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;
      const instance = new Html5Qrcode("qr-reader", {
        verbose: false,
        // Usa il decoder nativo del telefono quando c'è: molto più veloce a fuoco
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      }) as unknown as Html5QrcodeInstance;
      scannerRef.current = instance;

      try {
        await instance.start(
          { facingMode: "environment" }, // camera posteriore, sempre
          {
            fps: 12,
            qrbox: (vw: number, vh: number) => {
              const size = Math.floor(Math.min(vw, vh) * 0.75);
              return { width: size, height: size };
            },
          },
          (decoded: string) => {
            if (busy.current) return;
            const inst = scannerRef.current;
            scannerRef.current = null;
            if (inst) inst.stop().then(() => inst.clear()).catch(() => {});
            processToken(tokenFrom(decoded));
          },
          () => {}, // errori di frame: ignora
        );
        if (cancelled) return;
        setScannerReady(true);

        // Torcia disponibile? Mostra solo il pulsante, MA spenta:
        // il QR è su uno schermo, la torcia farebbe riflesso e peggiorerebbe.
        try {
          const torch = instance.getRunningTrackCameraCapabilities().torchFeature();
          if (torch.isSupported()) setTorchSupported(true);
        } catch { /* torcia non disponibile: pazienza */ }
      } catch (e) {
        if (!cancelled) {
          const err = e as { name?: string; message?: string };
          setCamError(
            err?.name === "NotAllowedError"
              ? "Hai negato il permesso alla fotocamera (o il telefono non l'ha chiesto)."
              : err?.name === "NotFoundError"
                ? "Non trovo nessuna fotocamera su questo dispositivo."
                : err?.name === "NotReadableError"
                  ? "La fotocamera è occupata da un'altra app: chiudila e riprova."
                  : `${err?.name ?? "Errore"}: ${err?.message ?? "non riesco ad accenderla"}`,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      const inst = scannerRef.current;
      scannerRef.current = null;
      if (inst) inst.stop().then(() => inst.clear()).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tokenFromUrl, tentativo]);

  async function toggleTorch() {
    const inst = scannerRef.current;
    if (!inst) return;
    try {
      const torch = inst.getRunningTrackCameraCapabilities().torchFeature();
      await torch.apply(!torchOn);
      setTorchOn((v) => !v);
    } catch { /* niente */ }
  }

  async function handleLogout() {
    // "Esci" toglie l'accesso a tutto il sito, non solo al pannello: va
    // detto prima, e va lasciata la home come approdo. Rimandare
    // all'accesso staff faceva pensare che bastasse rientrare da lì per
    // avere i permessi, e mandava in tondo con il tasto indietro.
    if (
      !window.confirm(
        "Esci dall'account?\n\nEsci da tutto il sito, non solo da qui. Per rientrare ti serve di nuovo il codice via mail.",
      )
    )
      return;
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
  }

  const won = phase === "done" && result?.ok && result.prize;
  const nothing = phase === "done" && result?.ok && !result.prize;

  return (
    <main className="flex-1 flex flex-col items-center px-6 py-8">
      {won && !result?.already && <Confetti />}

      <div className="w-full max-w-xs flex items-center justify-between mb-8">
        <h1 className="font-display text-brand-red text-3xl">Estrazione premi</h1>
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

          {/* La presenza alla serata: è quella che fa punti alle tessere crew */}
          {presenza && (
            <p className="mt-5 text-[11px] uppercase tracking-widest">
              {presenza.ok ? (
                <span className="text-emerald-400">
                  {presenza.nuova ? "✓ presenza registrata" : "già dentro stasera"} ·{" "}
                  {presenza.evento}
                  {typeof presenza.presenti === "number" && (
                    <span className="text-brand-gray/60"> · {presenza.presenti} in sala</span>
                  )}
                </span>
              ) : presenza.reason === "nessun_evento" ? (
                <span className="text-brand-gray/50">nessuna serata in corso: presenza non contata</span>
              ) : null}
            </p>
          )}
        </div>
      )}

      {/* SCANNER a riposo — solo camera posteriore, niente menù */}
      {phase === "idle" && !tokenFromUrl && (
        <>
          <div
            id="qr-reader"
            className="w-full max-w-xs overflow-hidden"
            style={{ minHeight: scannerReady ? undefined : 260 }}
          />

          {camError ? (
            <div className="mt-4 flex max-w-xs flex-col items-center text-center">
              <button
                onClick={() => setTentativo((n) => n + 1)}
                className="w-full bg-brand-red px-6 py-4 text-sm font-semibold uppercase tracking-widest text-white"
              >
                Accendi la fotocamera
              </button>
              <p className="mt-3 text-[12px] leading-relaxed text-brand-gray">{camError}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-brand-gray/70">
                Se stai usando l&apos;icona sulla schermata Home e non si accende, apri
                <strong className="text-white"> unpercento.it da Safari</strong>: la fotocamera
                nelle app salvate sul telefono a volte non parte.
              </p>
            </div>
          ) : !scannerReady ? (
            <p className="text-brand-gray text-sm animate-pulse-glow mt-4">
              Accendo la fotocamera…
            </p>
          ) : (
            <>
              <p className="text-xs text-brand-gray/60 mt-4 text-center max-w-xs">
                Inquadra il QR del membro. Tieni il telefono a ~15 cm.
              </p>
              {torchSupported && (
                <button
                  onClick={toggleTorch}
                  className={`text-xs uppercase tracking-widest border px-4 py-2 mt-4 transition-all ${
                    torchOn
                      ? "border-brand-red text-brand-red"
                      : "border-white/15 text-brand-gray"
                  }`}
                >
                  {torchOn ? "💡 Torcia accesa" : "🔦 Accendi torcia"}
                </button>
              )}
            </>
          )}

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
