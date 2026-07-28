"use client";

import { useEffect, useState } from "react";
import { getAvatar } from "@/lib/avatars";

// La scena madre del social 1%: poke reciproco → il volto si rivela.
// Il de-blur qui è solo teatro (CSS sulla foto NITIDA appena
// sbloccata dal server): la nitida arriva solo a chi ha il Legame.
type Props = {
  alias: string;
  clearUrl: string | null; // null = il partner non ha (ancora) la foto
  avatarId?: string | null;
  onClose: () => void;
};

const CLIP = "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))";

export default function RevealLegame({ alias, clearUrl, avatarId, onClose }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    // Piccola attesa, poi il de-blur parte; il testo arriva dopo.
    const t1 = setTimeout(() => setRevealed(true), 500);
    const t2 = setTimeout(() => setShowText(true), 1800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 px-6"
      role="dialog"
      aria-label={`Legame con ${alias}`}
    >
      <p className="text-[10px] uppercase tracking-[0.4em] text-brand-gray/60 mb-6">
        poke reciproco
      </p>

      <div
        className="relative overflow-hidden border border-brand-red/50"
        style={{ width: 220, height: 220, clipPath: CLIP, boxShadow: "0 0 60px rgba(224,24,31,0.25)" }}
      >
        {clearUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clearUrl}
            alt={alias}
            className="w-full h-full object-cover select-none"
            draggable={false}
            style={{
              filter: revealed ? "blur(0px)" : "blur(26px)",
              transform: revealed ? "scale(1)" : "scale(1.08)",
              transition: "filter 2.2s ease, transform 2.2s ease",
            }}
          />
        ) : (
          <span className="w-full h-full flex items-center justify-center text-[7rem]">
            {getAvatar(avatarId ?? "").emoji}
          </span>
        )}
      </div>

      <h2
        className="font-display text-brand-red text-5xl mt-8 tracking-wide"
        style={{
          opacity: showText ? 1 : 0,
          transform: showText ? "none" : "translateY(8px)",
          transition: "opacity 0.8s ease, transform 0.8s ease",
          textShadow: "0 0 24px rgba(224,24,31,0.5)",
        }}
      >
        LEGAME
      </h2>
      <p
        className="text-white/80 font-mono text-lg mt-2"
        style={{ opacity: showText ? 1 : 0, transition: "opacity 0.8s ease 0.3s" }}
      >
        {alias}
      </p>
      <p
        className="text-brand-gray text-xs mt-3 text-center max-w-xs"
        style={{ opacity: showText ? 1 : 0, transition: "opacity 0.8s ease 0.6s" }}
      >
        {clearUrl
          ? "Ora vi vedete davvero. Voi due, nessun altro."
          : "Il legame c'è. Il volto arriverà quando lo caricherà."}
      </p>

      <button
        onClick={onClose}
        className="btn btn-outline mt-8 text-xs"
        style={{ opacity: showText ? 1 : 0, transition: "opacity 0.8s ease 0.9s" }}
      >
        Continua
      </button>
    </div>
  );
}
