"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** Cosa accendere sulla parete. Poche lettere: è un ledwall, non un libro. */
  testo?: string;
  /** Filmato della sala, muto e in bianco e nero: è quello che si vede dentro i LED. */
  videoSrc?: string;
  /** Fotogramma di riserva, quando il telefono si rifiuta di far partire i video. */
  posterSrc?: string;
  /** Lato di un LED in pixel. Più grande = parete più grossolana. */
  cell?: number;
  className?: string;
};

const ROSSO = [224, 24, 31] as const;
const LIVELLI = 32; // gradini di luminosità: più fitti = sfumature più morbide

/**
 * La parete LED del locale, in homepage.
 *
 * Ogni quadratino è un LED. La luminosità di ognuno viene dal filmato
 * della sala campionato a bassissima risoluzione, quindi la serata si
 * intravede dentro la parete senza che si riconosca nessuno. Sopra,
 * il marchio è "acceso" a piena potenza, e il dito (o il mouse) accende
 * un alone di LED dove passa.
 *
 * Chi ha chiesto meno animazioni al sistema operativo vede una parete
 * ferma: il fotogramma di riserva, niente loop.
 */
export default function LedWall({
  testo = "1%",
  videoSrc,
  posterSrc,
  cell = 8,
  className = "",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const ridotto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Griglia di campionamento: un pixel per LED, non uno di più
    const sample = document.createElement("canvas");
    const sctx = sample.getContext("2d", { willReadFrequently: true });
    // Maschera del marchio: stessa griglia, dice quali LED sono dentro le lettere
    const mask = document.createElement("canvas");
    const mctx = mask.getContext("2d", { willReadFrequently: true });
    if (!sctx || !mctx) return;

    let cols = 0;
    let rows = 0;
    let passo = cell; // lato del LED, un po' più grosso sugli schermi larghi
    let w = 0;
    let h = 0;
    let maskData: Uint8ClampedArray | null = null;
    let sampleData: Uint8ClampedArray | null = null;
    // Esposizione automatica: qualunque spezzone, la sala resta in penombra
    let esposizione = 1;

    // Colori pre-calcolati: costruire stringhe 2000 volte per fotogramma no.
    const acceso: string[] = [];
    for (let i = 0; i < LIVELLI; i++) {
      const k = (i + 1) / LIVELLI;
      const r = Math.round(ROSSO[0] * Math.min(1, 0.25 + k * 0.8));
      // Il bianco arriva solo all'ultimo gradino: la parete resta rossa
      const caldo = Math.pow(k, 12);
      const g = Math.round(ROSSO[1] + (255 - ROSSO[1]) * caldo * 0.9);
      const b = Math.round(ROSSO[2] + (255 - ROSSO[2]) * caldo * 0.9);
      acceso.push(`rgb(${r},${g},${b})`);
    }
    const SPENTO = "rgba(255,255,255,0.045)";
    const BLOOM = "rgba(224,24,31,0.10)";

    const poster = posterSrc ? new Image() : null;
    let posterPronto = false;
    if (poster && posterSrc) {
      poster.src = posterSrc;
      poster.onload = () => {
        posterPronto = true;
        if (ridotto) disegna(0);
      };
    }

    const dito = { x: -9999, y: -9999, dentro: false };

    function misura() {
      const r = wrap!.getBoundingClientRect();
      w = Math.max(1, Math.floor(r.width));
      h = Math.max(1, Math.floor(r.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      passo = w >= 900 ? cell + 3 : cell;
      cols = Math.max(8, Math.ceil(w / passo));
      rows = Math.max(8, Math.ceil(h / passo));
      sample.width = cols;
      sample.height = rows;
      mask.width = cols;
      mask.height = rows;
      costruisciMaschera();
    }

    /** Scrive il marchio nella griglia dei LED: grosso, centrato, e ci deve stare. */
    function costruisciMaschera() {
      mctx!.clearRect(0, 0, cols, rows);
      mctx!.fillStyle = "#fff";
      mctx!.textAlign = "center";
      mctx!.textBaseline = "middle";

      let size = rows * 0.5;
      mctx!.font = `${size}px Anton, Impact, sans-serif`;
      const larghezzaMax = cols * 0.7;
      const misurata = mctx!.measureText(testo).width;
      if (misurata > larghezzaMax) {
        size = (size * larghezzaMax) / misurata;
        mctx!.font = `${size}px Anton, Impact, sans-serif`;
      }
      mctx!.fillText(testo, cols / 2, rows / 2);
      maskData = mctx!.getImageData(0, 0, cols, rows).data;
    }

    /** Il filmato (o il fotogramma di riserva) ridotto a un pixel per LED. */
    function campiona() {
      const v = videoRef.current;
      const sorgente: HTMLVideoElement | HTMLImageElement | null =
        v && v.readyState >= 2 && !ridotto ? v : posterPronto ? poster : null;
      if (!sorgente) return;

      const sw = sorgente instanceof HTMLVideoElement ? sorgente.videoWidth : sorgente.naturalWidth;
      const sh = sorgente instanceof HTMLVideoElement ? sorgente.videoHeight : sorgente.naturalHeight;
      if (!sw || !sh) return;

      // Riempie la parete tagliando i bordi, come un object-cover
      const scala = Math.max(cols / sw, rows / sh);
      const dw = sw * scala;
      const dh = sh * scala;
      sctx!.drawImage(sorgente, (cols - dw) / 2, (rows - dh) / 2, dw, dh);
      sampleData = sctx!.getImageData(0, 0, cols, rows).data;

      // Media della luminosità del fotogramma: se la scena è chiara
      // abbasso la potenza, così il marchio resta sempre il più acceso
      let somma = 0;
      const n = cols * rows;
      for (let k = 0; k < n; k++) {
        const j = k * 4;
        somma += (sampleData[j] * 0.299 + sampleData[j + 1] * 0.587 + sampleData[j + 2] * 0.114) / 255;
      }
      const media = somma / Math.max(1, n);
      esposizione = Math.min(1.3, Math.max(0.25, 0.13 / Math.max(0.02, media)));
    }

    let t = 0;
    let raf = 0;
    let ultimo = 0;

    function disegna(ora: number) {
      if (!ridotto) raf = requestAnimationFrame(disegna);
      // 30 fotogrammi al secondo: è una parete di LED, non un videogioco
      if (!ridotto && ora - ultimo < 33) return;
      ultimo = ora;
      t += 0.033;

      campiona();

      ctx!.fillStyle = "#050505";
      ctx!.fillRect(0, 0, w, h);

      const lato = Math.max(2, passo - 2);
      const mezzo = passo / 2;
      const raggio = Math.min(120, Math.max(80, w * 0.2));
      const sweep = ((t * 0.13) % 1.5) - 0.25; // banda di aggiornamento che scorre

      for (let y = 0; y < rows; y++) {
        const py = y * passo + mezzo;
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          const px = x * passo + mezzo;

          let b = 0;
          if (sampleData) {
            const lum =
              (sampleData[i] * 0.299 + sampleData[i + 1] * 0.587 + sampleData[i + 2] * 0.114) / 255;
            // Solo le luci della sala passano: il resto resta parete spenta
            b = Math.pow(lum, 1.9) * 0.34 * esposizione;
          }

          const dentroMarchio = maskData ? maskData[i + 3] > 90 : false;
          if (dentroMarchio) {
            // Dentro il marchio i LED sono sempre al massimo, ma la sala
            // si vede attraverso: le lettere hanno una texture che si muove
            // senza mai scendere sotto la soglia di leggibilità.
            const respiro = ridotto ? 0 : Math.sin(t * 1.5 - x * 0.05) * 0.04;
            b = 0.72 + b * 0.7 + respiro;
          }

          if (dito.dentro) {
            const dx = px - dito.x;
            const dy = py - dito.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < raggio) {
              const k = 1 - d / raggio;
              // Accende i LED spenti, non sbianca quelli già accesi
              b += k * k * 0.5 * (1 - Math.min(1, b));
            }
          }

          if (!ridotto) {
            const d2 = Math.abs(px / w - sweep);
            if (d2 < 0.07) b += (1 - d2 / 0.07) * 0.1;
          }

          if (!dentroMarchio && maskData && maskData[i + 3] > 20) {
            // Bordo delle lettere: mezza potenza, così il contorno non è a scalini
            b = Math.max(b, 0.3 + (maskData[i + 3] / 255) * 0.35);
          }

          if (b <= 0.035) {
            ctx!.fillStyle = SPENTO;
            ctx!.fillRect(px - lato / 2, py - lato / 2, lato, lato);
            continue;
          }

          if (b > 0.82) {
            ctx!.fillStyle = BLOOM;
            ctx!.fillRect(px - passo, py - passo, passo * 2, passo * 2);
          }

          const liv = Math.min(LIVELLI - 1, Math.floor(b * LIVELLI));
          ctx!.fillStyle = acceso[liv];
          ctx!.fillRect(px - lato / 2, py - lato / 2, lato, lato);
        }
      }
    }

    // ── Il dito / il mouse ──────────────────────────────────
    function muovi(e: PointerEvent) {
      const r = wrap!.getBoundingClientRect();
      dito.x = e.clientX - r.left;
      dito.y = e.clientY - r.top;
      dito.dentro = true;
      if (ridotto) disegna(0);
    }
    function esci() {
      dito.dentro = false;
      if (ridotto) disegna(0);
    }

    wrap.addEventListener("pointermove", muovi, { passive: true });
    wrap.addEventListener("pointerdown", muovi, { passive: true });
    wrap.addEventListener("pointerleave", esci, { passive: true });
    wrap.addEventListener("pointercancel", esci, { passive: true });

    // ── Avvio, misure, risparmio batteria ───────────────────
    misura();
    document.fonts?.ready.then(() => {
      costruisciMaschera();
      if (ridotto) disegna(0);
    });

    const ro = new ResizeObserver(() => {
      misura();
      if (ridotto) disegna(0);
    });
    ro.observe(wrap);

    let inVista = true;
    function accendi() {
      if (ridotto || raf) return;
      ultimo = 0;
      raf = requestAnimationFrame(disegna);
      videoRef.current?.play().catch(() => {});
    }
    function spegni() {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
      videoRef.current?.pause();
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        inVista = entry.isIntersecting;
        if (inVista && !document.hidden) accendi();
        else spegni();
      },
      { threshold: 0.05 },
    );
    io.observe(wrap);

    function visibilita() {
      if (document.hidden) spegni();
      else if (inVista) accendi();
    }
    document.addEventListener("visibilitychange", visibilita);

    if (ridotto) disegna(0);
    else accendi();

    return () => {
      spegni();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", visibilita);
      wrap.removeEventListener("pointermove", muovi);
      wrap.removeEventListener("pointerdown", muovi);
      wrap.removeEventListener("pointerleave", esci);
      wrap.removeEventListener("pointercancel", esci);
    };
  }, [testo, cell, posterSrc]);

  return (
    <div ref={wrapRef} className={`relative overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="block w-full h-full" aria-hidden />
      {/* Vignettatura: i bordi della parete sfumano nel nero della stanza */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse at 50% 45%, transparent 35%, rgba(5,5,5,0.55) 78%, rgba(5,5,5,0.9) 100%)",
        }}
      />
      {videoSrc && (
        <video
          ref={videoRef}
          src={videoSrc}
          poster={posterSrc}
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none absolute left-0 top-0 h-[2px] w-[2px] opacity-0"
        />
      )}
    </div>
  );
}
