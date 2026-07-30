"use client";

import { useEffect, useRef } from "react";

export type Stella = { alias: string; presente: boolean };

type Props = {
  /** L'alias decide il disegno: stesso alias, stesso sigillo, per sempre. */
  alias: string;
  /** Una stella per ogni persona portata. Accesa = si è presentata a una serata. */
  stelle: Stella[];
  /** 1..4 — quanti anelli ha il sigillo. */
  livello: number;
  /** Le serate fatte da lui: diventano tacche sull'anello esterno. */
  serate: number;
  className?: string;
};

const ROSSO = "224,24,31";
const ANGOLO_AUREO = 2.39996323; // la spirale con cui si dispongono i semi dei girasoli

/** Hash stabile dell'alias: due persone diverse non hanno lo stesso disegno. */
function seme(testo: string): number {
  let h = 2166136261;
  for (let i = 0; i < testo.length; i++) {
    h ^= testo.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Generatore pseudo-casuale con seme: stessa persona, stesso risultato. */
function casuale(s: number) {
  let a = s;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * La costellazione di un membro della crew.
 *
 * Al centro il suo sigillo, disegnato dal suo alias: numero di lati,
 * inclinazione e segni interni nascono da lì, quindi è solo suo e non
 * cambia mai. Attorno, una stella per ogni persona che ha portato:
 * accesa se quella persona si è presentata davvero a una serata,
 * spenta se si è solo iscritta. Quando le stelle accese si avvicinano
 * si legano tra loro e la nuvola diventa una figura.
 *
 * Nessun dato di nessun altro esce da qui: solo puntini.
 */
export default function Costellazione({
  alias,
  stelle,
  livello,
  serate,
  className = "",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ridotto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const s = seme(alias || "1%");
    const rnd = casuale(s);

    // Il sigillo: forma decisa una volta sola, dal seme
    const lati = 3 + (s % 5); // da 3 a 7
    const rotazione = (s % 360) * (Math.PI / 180);
    const segni = 2 + ((s >> 3) % 3); // i tratti interni
    const jitter = Array.from({ length: lati }, () => 0.86 + rnd() * 0.28);
    const tratti = Array.from({ length: segni }, () => ({
      a: rnd() * Math.PI * 2,
      b: rnd() * Math.PI * 2,
      d: 0.6 + rnd() * 0.38,
    }));
    // Lo scarto di ogni stella dalla spirale perfetta: la nuvola non è mai regolare
    const scarti = stelle.map(() => ({ r: 0.86 + rnd() * 0.3, a: (rnd() - 0.5) * 0.35 }));

    let w = 0;
    let h = 0;
    let raf = 0;

    function misura() {
      const r = wrap!.getBoundingClientRect();
      w = Math.max(120, Math.floor(r.width));
      h = Math.max(120, Math.floor(r.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function disegna(t: number) {
      const cx = w / 2;
      const cy = h / 2;
      const raggioMax = Math.min(w, h) / 2 - 10;
      const r0 = Math.max(20, Math.min(46, raggioMax * 0.26)); // il sigillo

      ctx!.clearRect(0, 0, w, h);

      // ── Le stelle ──────────────────────────────────────────
      // Spirale ad angolo aureo: crescono verso fuori senza mai
      // accavallarsi, come i semi di un girasole.
      const n = stelle.length;
      const primo = r0 + 14;
      const passo = n > 0 ? Math.max(6, (raggioMax - primo) / Math.sqrt(Math.max(n, 12))) : 0;
      const punti: { x: number; y: number; presente: boolean }[] = [];

      for (let i = 0; i < n; i++) {
        const sc = scarti[i];
        const raggio = Math.min(raggioMax, primo + passo * Math.sqrt(i + 1) * sc.r);
        const ang = i * ANGOLO_AUREO + rotazione + sc.a;
        punti.push({
          x: cx + Math.cos(ang) * raggio,
          y: cy + Math.sin(ang) * raggio,
          presente: stelle[i].presente,
        });
      }

      // I legami: due stelle accese abbastanza vicine si uniscono
      ctx!.lineWidth = 1;
      for (let i = 0; i < punti.length; i++) {
        if (!punti[i].presente) continue;
        for (let j = i + 1; j < Math.min(punti.length, i + 9); j++) {
          if (!punti[j].presente) continue;
          const dx = punti[i].x - punti[j].x;
          const dy = punti[i].y - punti[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > raggioMax * 0.28) continue;
          ctx!.strokeStyle = `rgba(${ROSSO},${0.45 * (1 - d / (raggioMax * 0.28))})`;
          ctx!.beginPath();
          ctx!.moveTo(punti[i].x, punti[i].y);
          ctx!.lineTo(punti[j].x, punti[j].y);
          ctx!.stroke();
        }
      }

      for (let i = 0; i < punti.length; i++) {
        const p = punti[i];
        if (!p.presente) {
          // Iscritto ma mai visto a una serata: resta un puntino spento
          ctx!.fillStyle = "rgba(255,255,255,0.22)";
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, 1.3, 0, Math.PI * 2);
          ctx!.fill();
          continue;
        }

        const brillo = ridotto ? 1 : 0.75 + Math.sin(t / 900 + i * 1.7) * 0.25;
        ctx!.fillStyle = `rgba(${ROSSO},${0.22 * brillo})`;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
        ctx!.fill();

        ctx!.fillStyle = `rgba(255,${Math.round(190 * brillo)},${Math.round(190 * brillo)},1)`;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, 2.1, 0, Math.PI * 2);
        ctx!.fill();

        // il lampo a croce delle stelle vere
        ctx!.strokeStyle = `rgba(255,255,255,${0.5 * brillo})`;
        ctx!.lineWidth = 0.8;
        ctx!.beginPath();
        ctx!.moveTo(p.x - 5, p.y);
        ctx!.lineTo(p.x + 5, p.y);
        ctx!.moveTo(p.x, p.y - 5);
        ctx!.lineTo(p.x, p.y + 5);
        ctx!.stroke();
      }

      // ── Il sigillo ─────────────────────────────────────────
      ctx!.save();
      ctx!.translate(cx, cy);
      ctx!.rotate(rotazione);

      // alone
      const alone = ctx!.createRadialGradient(0, 0, 0, 0, 0, r0 * 3);
      alone.addColorStop(0, `rgba(${ROSSO},0.35)`);
      alone.addColorStop(1, `rgba(${ROSSO},0)`);
      ctx!.fillStyle = alone;
      ctx!.beginPath();
      ctx!.arc(0, 0, r0 * 3, 0, Math.PI * 2);
      ctx!.fill();

      // corpo
      ctx!.beginPath();
      for (let i = 0; i < lati; i++) {
        const a = (i / lati) * Math.PI * 2 - Math.PI / 2;
        const r = r0 * jitter[i];
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx!.moveTo(x, y);
        else ctx!.lineTo(x, y);
      }
      ctx!.closePath();
      ctx!.fillStyle = "rgba(10,10,10,0.9)";
      ctx!.fill();
      ctx!.strokeStyle = `rgba(${ROSSO},0.35)`;
      ctx!.lineWidth = 5;
      ctx!.stroke();
      ctx!.strokeStyle = `rgba(${ROSSO},1)`;
      ctx!.lineWidth = 2;
      ctx!.stroke();

      // i segni interni: il marchio dentro il marchio
      ctx!.strokeStyle = "rgba(255,255,255,0.9)";
      ctx!.lineWidth = 2;
      ctx!.lineCap = "round";
      for (const tr of tratti) {
        ctx!.beginPath();
        ctx!.moveTo(Math.cos(tr.a) * r0 * tr.d, Math.sin(tr.a) * r0 * tr.d);
        ctx!.lineTo(Math.cos(tr.b) * r0 * tr.d, Math.sin(tr.b) * r0 * tr.d);
        ctx!.stroke();
      }
      ctx!.lineCap = "butt";
      ctx!.fillStyle = `rgba(${ROSSO},1)`;
      ctx!.beginPath();
      ctx!.arc(0, 0, 2.6, 0, Math.PI * 2);
      ctx!.fill();

      // gli anelli del livello
      for (let i = 1; i < livello; i++) {
        ctx!.strokeStyle = `rgba(${ROSSO},${0.55 - i * 0.1})`;
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.arc(0, 0, r0 + 6 * i, 0, Math.PI * 2);
        ctx!.stroke();
      }

      // le tacche delle serate fatte, sull'anello esterno
      const tacche = Math.min(24, serate);
      if (tacche > 0) {
        const anello = r0 + 6 * Math.max(1, livello - 1) + 7;
        ctx!.strokeStyle = "rgba(255,255,255,0.22)";
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.arc(0, 0, anello, 0, Math.PI * 2);
        ctx!.stroke();

        ctx!.strokeStyle = "rgba(255,255,255,0.95)";
        ctx!.lineWidth = 2;
        for (let i = 0; i < tacche; i++) {
          const a = (i / Math.max(tacche, 10)) * Math.PI * 2 - Math.PI / 2;
          ctx!.beginPath();
          ctx!.moveTo(Math.cos(a) * (anello - 3), Math.sin(a) * (anello - 3));
          ctx!.lineTo(Math.cos(a) * (anello + 3), Math.sin(a) * (anello + 3));
          ctx!.stroke();
        }
      }

      ctx!.restore();
    }

    function ciclo(t: number) {
      disegna(t);
      raf = requestAnimationFrame(ciclo);
    }

    misura();
    if (ridotto) disegna(0);
    else raf = requestAnimationFrame(ciclo);

    const ro = new ResizeObserver(() => {
      misura();
      disegna(performance.now());
    });
    ro.observe(wrap);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [alias, stelle, livello, serate]);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        role="img"
        aria-label={`Costellazione di ${alias}: ${stelle.length} persone portate, ${stelle.filter((x) => x.presente).length} presentate`}
      />
    </div>
  );
}
