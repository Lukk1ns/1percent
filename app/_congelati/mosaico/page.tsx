"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Cell = { on: boolean; alias?: string };
type Grid = { cols: number; rows: number; fontSize: number; cells: Cell[] };

// Costruisce la sagoma "1%" da un canvas nascosto e mappa un alias su ogni
// cella "accesa". Sceglie la cella più grande possibile in cui ci stanno
// TUTTI gli iscritti (così nessuno resta fuori) → nomi il più leggibili possibile.
function buildGrid(aliases: string[], antonFamily: string): Grid {
  const W = 640;
  const H = 320;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { cols: 0, rows: 0, fontSize: 10, cells: [] };

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Scala il font così che "1%" occupi ~92% della larghezza.
  let size = 260;
  ctx.font = `${size}px ${antonFamily}`;
  const w = ctx.measureText("1%").width || W;
  size = (size * (W * 0.92)) / w;
  ctx.font = `${size}px ${antonFamily}`;
  ctx.fillText("1%", W / 2, H / 2 + size * 0.02);

  const img = ctx.getImageData(0, 0, W, H).data;

  const sample = (cell: number) => {
    const cols = Math.floor(W / cell);
    const rows = Math.floor(H / cell);
    const on: boolean[] = [];
    let count = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = Math.min(W - 1, Math.floor(c * cell + cell / 2));
        const y = Math.min(H - 1, Math.floor(r * cell + cell / 2));
        const alpha = img[(y * W + x) * 4 + 3];
        const isOn = alpha > 90;
        on.push(isOn);
        if (isOn) count++;
      }
    }
    return { cols, rows, on, count };
  };

  // Cella più grande in cui entrano tutti gli iscritti.
  const need = Math.max(1, aliases.length);
  let chosen = sample(8);
  for (let cell = 30; cell >= 8; cell -= 2) {
    const g = sample(cell);
    if (g.count >= need) {
      chosen = g;
      break;
    }
    chosen = g; // fallback: la più fitta se non entrano tutti
  }

  // Assegna un alias a ogni cella accesa (in ordine, ciclando se avanzano celle).
  let k = 0;
  const cells: Cell[] = chosen.on.map((isOn) => {
    if (!isOn) return { on: false };
    const alias = aliases.length ? aliases[k % aliases.length] : undefined;
    k++;
    return { on: true, alias };
  });

  const containerW = Math.min(typeof window !== "undefined" ? window.innerWidth * 0.94 : 640, 680);
  const fontSize = Math.max(5, Math.min(13, (containerW / chosen.cols) * 0.82));

  return { cols: chosen.cols, rows: chosen.rows, fontSize, cells };
}

export default function MosaicoPage() {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [count, setCount] = useState(0);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const shotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("recent_members", { limit_count: 2000 });
      const aliases: string[] = (data ?? [])
        .map((m: { alias: string }) => m.alias)
        .filter(Boolean);
      setCount(aliases.length);

      // Aspetta che il font Anton sia caricato, poi calcola la sagoma.
      if (document.fonts?.ready) await document.fonts.ready;
      const antonFamily =
        getComputedStyle(document.documentElement).getPropertyValue("--font-anton").trim() ||
        "sans-serif";
      setGrid(buildGrid(aliases, antonFamily));
    })();
  }, []);

  const q = query.trim().toLowerCase();

  async function handleSave() {
    if (!shotRef.current) return;
    setSaving(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(shotRef.current, {
        backgroundColor: "#0a0a0a",
        scale: 2,
        useCORS: true,
      });
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], "1percent-muro.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: "1% — siamo noi" });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "1percent-muro.png";
          a.click();
          URL.revokeObjectURL(url);
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }, "image/png");
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col items-center px-4 py-10">
      <p className="text-[10px] uppercase tracking-[0.4em] text-brand-gray/60 mb-2">
        not for everyone
      </p>
      <h1 className="font-display text-white text-center leading-tight mb-1"
        style={{ fontSize: "clamp(1.6rem, 7vw, 2.6rem)" }}>
        L&apos;1% è fatto di voi
      </h1>
      <p className="text-brand-gray text-xs mb-8">
        {count > 0 ? <><span className="text-brand-red">{count}</span> nomi. Il resto è a casa.</> : "…"}
      </p>

      {/* Immagine salvabile */}
      <div
        ref={shotRef}
        className="w-full max-w-[680px] px-3 py-6"
        style={{ background: "#0a0a0a" }}
      >
        {!grid ? (
          <div className="h-52 flex items-center justify-center">
            <span className="font-display text-brand-red text-5xl animate-pulse-glow">1%</span>
          </div>
        ) : (
          <div
            className="mx-auto"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
              lineHeight: 1,
            }}
          >
            {grid.cells.map((cell, i) => {
              if (!cell.on) return <span key={i} style={{ aspectRatio: "1" }} />;
              const isMatch = q.length > 0 && cell.alias?.toLowerCase() === q;
              const accent = i % 9 === 0;
              return (
                <span
                  key={i}
                  title={cell.alias}
                  style={{
                    aspectRatio: "1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    fontSize: `${grid.fontSize}px`,
                    letterSpacing: "-0.03em",
                    fontWeight: 600,
                    color: isMatch ? "#fff" : accent ? "#e0181f" : "rgba(255,255,255,0.82)",
                    background: isMatch ? "#e0181f" : "transparent",
                    borderRadius: isMatch ? 2 : 0,
                    textShadow: isMatch ? "0 0 8px rgba(224,24,31,0.9)" : "none",
                    transform: isMatch ? "scale(1.15)" : "none",
                    transition: "all 0.2s",
                  }}
                >
                  {cell.alias}
                </span>
              );
            })}
          </div>
        )}
        <p className="text-center text-[9px] uppercase tracking-[0.35em] text-brand-gray/50 mt-5">
          1% · Papi on the Beach · 8 luglio
        </p>
      </div>

      {/* Cerca il tuo nome */}
      <input
        type="text"
        placeholder="cerca il tuo alias…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mt-8 w-full max-w-xs bg-transparent border-b border-white/20 text-white placeholder-brand-gray/40 pb-2 outline-none focus:border-brand-red transition-colors text-sm text-center"
      />
      {q.length > 0 && grid && (
        <p className="text-xs mt-2 text-brand-gray">
          {grid.cells.some((c) => c.alias?.toLowerCase() === q)
            ? "eccoti. sei nel muro."
            : "questo alias non è tra noi."}
        </p>
      )}

      {/* Azioni */}
      <div className="flex flex-col items-center gap-4 mt-8 w-full max-w-xs">
        <button
          onClick={handleSave}
          disabled={saving || !grid}
          className="w-full bg-brand-red py-4 text-sm font-semibold uppercase tracking-widest text-white disabled:opacity-40"
        >
          {saving ? "Genero…" : saved ? "Fatto ✓" : "Salva / condividi"}
        </button>
        <Link
          href="/"
          className="text-xs uppercase tracking-widest text-brand-gray/50 hover:text-brand-gray transition-colors"
        >
          ← torna alla home
        </Link>
      </div>
    </main>
  );
}
