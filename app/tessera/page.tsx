"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import Costellazione, { type Stella } from "@/components/Costellazione";
import { dataCorta } from "@/lib/eventi";
import { NavBasso } from "@/components/NavBasso";
import { CHIAVE_INVITO, SOLO_SU_INVITO } from "@/lib/event";

type Carta = {
  ok: boolean;
  reason?: string;
  alias: string;
  member_number: number;
  role: string;
  referral_code: string;
  portati_totali: number;
  portati_presenti: number;
  presenze_portati: number;
  serate_mie: number;
  punti_mese: number;
  posizione: number;
  crew_totali: number;
  livello: number;
  stelle: Stella[];
  evento: { nome: string; starts_at: string } | null;
};

/** I quattro gradini, letti dal disegno prima che dal numero. */
const LIVELLI = [
  { nome: "nebulosa", serve: 10 },
  { nome: "stella", serve: 30 },
  { nome: "costellazione", serve: 100 },
  { nome: "galassia", serve: null as number | null },
];

export default function TesseraPage() {
  const router = useRouter();
  const [carta, setCarta] = useState<Carta | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [girata, setGirata] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvata, setSalvata] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
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
      const { data, error } = await supabase.rpc("my_crew_card");
      if (error) {
        setErrore(
          "Tessera non disponibile. Manca supabase/05_carta_crew.sql nel SQL Editor (" +
            error.message +
            ")",
        );
        return;
      }
      const c = data as Carta;
      if (!c?.ok) {
        router.replace("/unisciti");
        return;
      }
      if (c.role !== "crew") {
        // Questa tessera è di chi lavora alle serate: gli altri hanno la card
        router.replace("/card");
        return;
      }
      setCarta(c);
    })();
  }, [router]);

  // Il QR del suo link personale: chi lo inquadra si iscrive e resta suo
  useEffect(() => {
    if (!carta || !girata || !qrRef.current) return;
    const url = `${window.location.origin}/unisciti?ref=${carta.referral_code}${SOLO_SU_INVITO ? `&k=${CHIAVE_INVITO}` : ""}`;
    QRCode.toCanvas(qrRef.current, url, {
      width: 200,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
  }, [carta, girata]);

  async function salva() {
    if (!frontRef.current) return;
    setSalvando(true);
    try {
      const { domToBlob } = await import("modern-screenshot");
      const blob = await domToBlob(frontRef.current, {
        backgroundColor: "#080808",
        scale: 3,
        type: "image/png",
      });
      if (!blob) throw new Error("vuota");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tessera-1percent-${carta?.alias ?? "crew"}.png`;
      a.click();
      URL.revokeObjectURL(url);
      setSalvata(true);
      setTimeout(() => setSalvata(false), 2500);
    } finally {
      setSalvando(false);
    }
  }

  async function condividi() {
    if (!carta) return;
    const url = `${window.location.origin}/unisciti?ref=${carta.referral_code}${SOLO_SU_INVITO ? `&k=${CHIAVE_INVITO}` : ""}`;
    if (navigator.share) {
      await navigator.share({ title: "1%", text: "Entra dall'1% con il mio link", url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url);
    alert("Link copiato.");
  }

  if (errore) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-display text-4xl text-brand-red">1%</p>
        <p className="max-w-sm text-sm text-brand-gray">{errore}</p>
      </main>
    );
  }

  if (!carta) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="font-display text-6xl text-brand-red animate-pulse-glow">1%</p>
      </main>
    );
  }

  const liv = LIVELLI[Math.min(3, Math.max(0, carta.livello - 1))];
  const mancano = liv.serve ? liv.serve - carta.portati_totali : 0;
  const numero = `#${String(carta.member_number).padStart(4, "0")}`;

  return (
    <main className="flex-1 px-5 py-8 w-full max-w-md mx-auto flex flex-col items-center">
      <p className="font-tech text-[10px] uppercase tracking-[0.4em] text-brand-gray/60">
        tessera crew
      </p>

      {/* ── LA TESSERA ─────────────────────────────────── */}
      <div className="mt-5 w-full" style={{ perspective: "1200px" }}>
        <div
          className="relative w-full transition-transform duration-700"
          style={{
            transformStyle: "preserve-3d",
            transform: girata ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* Fronte */}
          <div
            ref={frontRef}
            className="relative overflow-hidden border border-brand-red/30 bg-[#080808] px-5 pb-6 pt-5"
            style={{ backfaceVisibility: "hidden", aspectRatio: "3 / 4" }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display text-2xl leading-none text-brand-red">1%</p>
                <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.35em] text-brand-gray/70">
                  crew · {numero}
                </p>
              </div>
              {carta.evento && (
                <div className="text-right">
                  <p className="font-tech text-[9px] uppercase tracking-[0.3em] text-brand-gray/50">
                    edizione
                  </p>
                  <p className="font-tech text-[10px] uppercase tracking-[0.15em] text-white/90">
                    {carta.evento.nome}
                  </p>
                  <p className="font-tech text-[9px] uppercase tracking-[0.2em] text-brand-gray/60">
                    {dataCorta(carta.evento.starts_at)}
                  </p>
                </div>
              )}
            </div>

            <Costellazione
              alias={carta.alias}
              stelle={carta.stelle ?? []}
              livello={carta.livello}
              serate={carta.serate_mie}
              className="mt-2 h-[58%] w-full"
            />

            <div className="mt-1 text-center">
              <p className="font-display text-3xl uppercase leading-none text-white">
                {carta.alias}
              </p>
              <p className="mt-1 font-tech text-[10px] uppercase tracking-[0.35em] text-brand-red">
                {liv.nome}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-3 border-t border-white/10 pt-3 text-center">
              <div>
                <p className="font-tech text-lg font-bold text-white">{carta.portati_presenti}</p>
                <p className="font-tech text-[8px] uppercase tracking-[0.2em] text-brand-gray/60">
                  venuti
                </p>
              </div>
              <div className="border-x border-white/10">
                <p className="font-tech text-lg font-bold text-white">{carta.portati_totali}</p>
                <p className="font-tech text-[8px] uppercase tracking-[0.2em] text-brand-gray/60">
                  portati
                </p>
              </div>
              <div>
                <p className="font-tech text-lg font-bold text-white">{carta.serate_mie}</p>
                <p className="font-tech text-[8px] uppercase tracking-[0.2em] text-brand-gray/60">
                  serate
                </p>
              </div>
            </div>
          </div>

          {/* Retro: il suo invito */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 border border-brand-red/30 bg-[#080808] px-6"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <p className="font-tech text-[10px] uppercase tracking-[0.35em] text-brand-gray/70">
              il tuo invito
            </p>
            <div className="border border-brand-red/25 bg-black p-3">
              <canvas ref={qrRef} />
            </div>
            <p className="text-center text-xs leading-relaxed text-brand-gray">
              Chi lo inquadra si iscrive
              <br />e resta <span className="text-white">attribuito a te</span>. Per sempre.
            </p>
            <p className="font-tech text-[11px] uppercase tracking-[0.3em] text-brand-red">
              {carta.referral_code}
            </p>
          </div>
        </div>
      </div>

      {/* ── Comandi ─────────────────────────────────────── */}
      <div className="mt-5 flex w-full gap-2">
        <button onClick={() => setGirata(!girata)} className="btn btn-primary flex-1">
          {girata ? "← Gira" : "Gira: il QR →"}
        </button>
        <button onClick={condividi} className="btn btn-outline flex-1">
          Manda il link
        </button>
      </div>
      <button onClick={salva} disabled={salvando} className="btn btn-ghost mt-2 w-full">
        {salvando ? "Preparo…" : salvata ? "Salvata ✓" : "Salva la tessera"}
      </button>

      {/* ── Cosa vuol dire ──────────────────────────────── */}
      <div className="mt-8 w-full border-t border-white/5 pt-5">
        <p className="font-tech text-[10px] uppercase tracking-[0.4em] text-brand-gray/60">
          questo mese
        </p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <p className="led-digits text-4xl leading-none">
              {carta.posizione}
              <span className="text-lg text-brand-gray/60">° su {carta.crew_totali}</span>
            </p>
            <p className="mt-2 font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray/60">
              {carta.punti_mese} presenze portate a casa
            </p>
          </div>
          <div className="text-right">
            <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray/60">
              livello
            </p>
            <p className="font-display text-xl uppercase text-brand-red">{liv.nome}</p>
            {liv.serve && (
              <p className="font-tech text-[10px] text-brand-gray/50">
                {mancano} al prossimo
              </p>
            )}
          </div>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-brand-gray/70">
          Ogni stella accesa è una persona che hai portato e che si è
          <span className="text-white"> presentata davvero</span>: la contiamo quando passa
          dallo <span className="text-white">stand UNPERCENTO</span> e fa l&apos;estrazione.
          I puntini spenti si sono solo iscritti — quelli non valgono. Le tacche attorno al
          sigillo sono le serate in cui sei passato tu allo stand: <span className="text-white">
          giochi anche tu</span>, drink e shot si vincono come tutti gli altri.
        </p>
      </div>

      <NavBasso />
    </main>
  );
}
