"use client";

import { useState } from "react";
import { getAvatar } from "@/lib/avatars";
import { voltoBlurUrl } from "@/lib/volto";

// Il Volto: mostra la foto profilo (sfocata di suo, generata dal server)
// oppure l'avatar emoji per chi non l'ha caricata.
// `clearUrl` (URL firmato) mostra la versione nitida: solo per il
// proprietario — e in Fase B per i Legami.
type Props = {
  photoBlurPath?: string | null;
  photoUpdatedAt?: string | null;
  avatarId?: string | null;
  clearUrl?: string | null;
  blurSrc?: string | null; // anteprima già sfocata (data URL), es. in fase di upload
  size: number; // px
  alt?: string;
  className?: string;
};

const CLIP = "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))";

export default function Volto({
  photoBlurPath,
  photoUpdatedAt,
  avatarId,
  clearUrl,
  blurSrc,
  size,
  alt = "",
  className = "",
}: Props) {
  // Se l'immagine non si carica (file mancante, rete), niente icona
  // rotta del browser: si torna all'emoji.
  const [broken, setBroken] = useState(false);

  const blurred =
    blurSrc ?? (photoBlurPath ? voltoBlurUrl(photoBlurPath, photoUpdatedAt) : null);
  const src = broken ? null : (clearUrl ?? blurred);

  if (!src) {
    // Fallback: avatar emoji (set originale)
    return (
      <span
        className={`inline-flex items-center justify-center ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.62, lineHeight: 1 }}
        aria-label={alt}
      >
        {getAvatar(avatarId ?? "").emoji}
      </span>
    );
  }

  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden ${className}`}
      style={{ width: size, height: size, clipPath: CLIP }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        className="w-full h-full object-cover select-none"
        draggable={false}
        loading="lazy"
        onError={() => setBroken(true)}
      />
      {/* Velo rosso brand solo sulle foto sfocate */}
      {!clearUrl && (
        <span
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(160deg, rgba(224,24,31,0.16), rgba(10,10,10,0.28))",
            mixBlendMode: "multiply",
          }}
        />
      )}
    </span>
  );
}
