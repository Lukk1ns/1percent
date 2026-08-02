"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import { STAND_NON_INGRESSO, CHIAVE_INVITO, SOLO_SU_INVITO } from "@/lib/event";
import { NavBasso } from "@/components/NavBasso";

/**
 * L'invito, fatto per essere usato in piedi in mezzo alla gente.
 *
 * Tre modi, in ordine di velocità: gli fai inquadrare il QR, gli mandi
 * il messaggio già scritto, o copi il link. In tutti e tre i casi chi
 * si iscrive resta attribuito a chi ha invitato, per sempre.
 *
 * In fondo c'è quello che i PR dimenticano sempre: cosa raccontare.
 */
export default function InvitaPage() {
  const router = useRouter();
  const [refCode, setRefCode] = useState<string | null>(null);
  const [crew, setCrew] = useState(false);
  const [count, setCount] = useState(0);
  const [copiato, setCopiato] = useState(false);
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/unisciti");
        return;
      }

      const [{ data: profile }, { data: refCount }] = await Promise.all([
        supabase.from("profiles").select("referral_code,role").eq("id", user.id).single(),
        supabase.rpc("referral_count"),
      ]);

      if (!profile) {
        router.replace("/unisciti");
        return;
      }
      setRefCode(profile.referral_code as string);
      setCrew(profile.role === "crew");
      setCount((refCount as number) ?? 0);
    })();
  }, [router]);

  const link =
    refCode && typeof window !== "undefined"
      ? `${window.location.origin}/unisciti?ref=${refCode}${SOLO_SU_INVITO ? `&k=${CHIAVE_INVITO}` : ""}`
      : "";

  // Il QR grande: dal vivo è il modo più veloce, si fa inquadrare e basta
  useEffect(() => {
    if (!link || !qrRef.current) return;
    QRCode.toCanvas(qrRef.current, link, {
      width: 232,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
  }, [link]);

  const messaggio = `Ti metto dentro l'1%.

Sono le serate che organizziamo in zona Pordenone. Iscriviti da qui, ci vogliono 30 secondi e non serve il nome vero:
${link}

Quando vieni, passa dallo stand UNPERCENTO dentro il locale e fai scansionare il tuo QR: parte l'estrazione e ritiri sul momento quello che vinci — drink, shot e altro. Si gioca a ogni serata.`;

  async function copia(testo: string) {
    await navigator.clipboard.writeText(testo);
    setCopiato(true);
    setTimeout(() => setCopiato(false), 2000);
  }

  async function manda() {
    if (navigator.share) {
      await navigator.share({ title: "1%", text: messaggio }).catch(() => {});
      return;
    }
    await copia(messaggio);
  }

  if (!refCode) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="font-display text-brand-red text-6xl animate-pulse-glow">1%</div>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full max-w-md mx-auto px-5 py-8 flex flex-col items-center">
      <p className="font-tech text-[10px] uppercase tracking-[0.4em] text-brand-gray/60">
        il tuo invito
      </p>
      <p className="mt-3 text-center text-white">
        Hai portato <span className="font-display text-3xl text-brand-red">{count}</span>{" "}
        {count === 1 ? "persona" : "persone"}
      </p>

      {/* 1. Il QR — il modo più veloce quando ce l'hai davanti */}
      <div className="mt-6 w-full border border-brand-red/25 bg-black p-5 text-center">
        <p className="font-tech text-[10px] uppercase tracking-[0.3em] text-brand-gray/70">
          fatti inquadrare
        </p>
        <div className="mt-4 flex justify-center">
          <canvas ref={qrRef} />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-brand-gray">
          Chi lo inquadra si iscrive in 30 secondi e resta{" "}
          <span className="text-white">attribuito a te</span>. Per sempre.
        </p>
      </div>

      {/* 2. Il messaggio già scritto */}
      <button onClick={manda} className="btn btn-primary mt-5 w-full">
        Manda l&apos;invito già scritto
      </button>
      <button onClick={() => copia(link)} className="btn btn-outline mt-2 w-full">
        {copiato ? "Copiato ✓" : "Copia solo il link"}
      </button>
      <p className="mt-3 break-all text-center font-tech text-[10px] text-brand-gray/40">
        {link}
      </p>

      {/* 3. Cosa raccontare */}
      <div className="mt-8 w-full border-t border-white/5 pt-6">
        <p className="font-tech text-[10px] uppercase tracking-[0.4em] text-brand-gray/60">
          cosa dirgli
        </p>
        <ol className="mt-4 flex flex-col gap-4">
          {[
            {
              n: "01",
              t: "Iscriviti col mio link",
              d: "Trenta secondi: alias, simbolo ed email per rientrare. Niente nome vero.",
            },
            {
              n: "02",
              t: "Vieni alla serata",
              d: STAND_NON_INGRESSO,
            },
            {
              n: "03",
              t: "Passa dallo stand UNPERCENTO",
              d: "Fai scansionare il QR dal telefono: parte l'estrazione e ritiri sul momento — drink, shot, magliette. Si gioca a ogni serata, anche tu.",
            },
          ].map((r) => (
            <li key={r.n} className="flex gap-3">
              <span className="font-tech text-[11px] text-brand-red">{r.n}</span>
              <span>
                <span className="block text-sm text-white">{r.t}</span>
                <span className="block text-xs leading-relaxed text-brand-gray/70">{r.d}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs leading-relaxed text-brand-gray/60">
          Quello che conta non è chi si iscrive: è{" "}
          <span className="text-white">chi si presenta</span> e passa dallo stand. Lì la sua
          stella si accende{crew ? " sulla tua tessera" : ""}.
        </p>
      </div>

      <div className="mt-8 flex w-full gap-2">
        {crew && (
          <button onClick={() => router.push("/tessera")} className="btn btn-outline flex-1">
            La tua tessera →
          </button>
        )}
        <button onClick={() => router.push("/card")} className="btn btn-ghost flex-1">
          La tua card
        </button>
      </div>

      <NavBasso />
    </main>
  );
}
