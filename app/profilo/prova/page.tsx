"use client";

// Pagina interna (non linkata da nessuna parte): serve a Luka per
// scegliere il livello di blur. Carichi una foto campione, vedi i
// 3 livelli affiancati, scegli → il valore va in lib/volto.ts.

import { useRef, useState } from "react";
import { downscaleImage } from "@/lib/downscale";
import Volto from "@/components/Volto";

type Preview = { id: string; sigma: number; active: boolean; dataUrl: string };

export default function ProvaBlurPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(f: File) {
    setError(null);
    setLoading(true);
    setPreviews([]);
    if (localUrl) URL.revokeObjectURL(localUrl);
    const small = await downscaleImage(f);
    setLocalUrl(URL.createObjectURL(small));

    const fd = new FormData();
    fd.append("file", small, "volto.jpg");
    const res = await fetch("/api/volto/preview?all=1", { method: "POST", body: fd });
    setLoading(false);
    if (!res.ok) {
      setError("Foto non valida (o non sei loggato come membro).");
      return;
    }
    const json = await res.json();
    setPreviews(json.previews ?? []);
  }

  return (
    <main className="flex-1 flex flex-col items-center px-4 py-10 w-full max-w-2xl mx-auto">
      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-2">prova blur — pagina interna</p>
      <h1 className="font-display text-brand-red text-5xl mb-6">1%</h1>
      <p className="text-brand-gray text-sm text-center mb-8 max-w-sm">
        Carica una foto campione e scegli il livello: <span className="text-white">si deve intravedere, non riconoscere</span>.
      </p>

      <button onClick={() => fileRef.current?.click()} className="btn btn-primary mb-8">
        Carica foto campione
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      {loading && <div className="font-display text-brand-red text-4xl animate-pulse-glow">1%</div>}
      {error && <p className="text-brand-red text-sm">{error}</p>}

      {previews.length > 0 && (
        <div className="w-full flex flex-wrap items-end justify-center gap-6 animate-fade-up">
          {localUrl && (
            <figure className="flex flex-col items-center">
              <Volto clearUrl={localUrl} size={150} alt="originale" />
              <figcaption className="text-[10px] uppercase tracking-widest text-brand-gray/60 mt-2">
                originale
              </figcaption>
            </figure>
          )}
          {previews.map((p) => (
            <figure key={p.id} className="flex flex-col items-center">
              <Volto
                blurSrc={p.dataUrl}
                size={150}
                alt={p.id}
                className={p.active ? "border border-brand-red/60" : ""}
              />
              <figcaption
                className={`text-[10px] uppercase tracking-widest mt-2 ${p.active ? "text-brand-red" : "text-brand-gray/60"}`}
              >
                {p.id} (σ{p.sigma}){p.active ? " — attivo" : ""}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {previews.length > 0 && (
        <p className="text-brand-gray/50 text-xs text-center mt-8 max-w-sm">
          Il livello con il bordo rosso è quello attivo oggi. Per cambiarlo: dimmelo e aggiorno <span className="font-mono">BLUR_SIGMA</span>.
        </p>
      )}
    </main>
  );
}
