"use client";

import { useEffect, useState } from "react";

const CHARS = "01%#$&X@!";
function randomChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

export function EntrySequence({ onDone }: { onDone: () => void }) {
  const [display, setDisplay] = useState("___");
  const [line, setLine] = useState("ACCESSO IN CORSO");
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let frame = 0;
    const target = "1%";
    const total = 28;

    const interval = setInterval(() => {
      frame++;
      if (frame < total - 6) {
        setDisplay(
          Array.from({ length: 2 }, () => randomChar()).join(""),
        );
        if (frame % 4 === 0) {
          const lines = [
            "ACCESSO IN CORSO",
            "VERIFICA IDENTITÀ",
            "PROTOCOLLO 1%",
            "SCANNING...",
          ];
          setLine(lines[Math.floor(frame / 4) % lines.length]);
        }
      } else if (frame < total) {
        setDisplay(target);
        setLine("ACCESSO CONFERMATO");
      } else {
        clearInterval(interval);
        setFlash(true);
        setTimeout(onDone, 200);
      }
    }, 80);

    return () => clearInterval(interval);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      {/* Flash rosso finale */}
      {flash && (
        <div
          className="white-flash absolute inset-0 pointer-events-none"
          style={{ background: "rgba(224,24,31,0.55)" }}
          aria-hidden
        />
      )}
      {/* Scanline */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(224,24,31,0.03) 2px, rgba(224,24,31,0.03) 4px)",
        }}
        aria-hidden
      />

      <p
        className="font-display text-brand-red"
        style={{ fontSize: "clamp(5rem, 30vw, 10rem)", lineHeight: 1 }}
      >
        {display}
      </p>
      <p className="mt-6 text-xs uppercase tracking-[0.4em] text-brand-gray/70 font-mono">
        {line}
      </p>

      {/* Barra di progresso */}
      <div className="mt-8 w-32 h-px bg-white/10 overflow-hidden">
        <div
          className="h-full bg-brand-red transition-all duration-75"
          style={{ width: "100%", animation: "scan-progress 2.2s linear both" }}
        />
      </div>

      <style>{`
        @keyframes scan-progress {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
}
