"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import { downscaleImage } from "@/lib/downscale";
import {
  type AppPR,
  type TavoloPR,
  ICONA_PPR_180,
  LOGO_PAPION,
  ROSSO_PAPION,
  SCONTO_DA,
  SCONTO_EURO,
  bollini,
  dataCorta,
  dataLunga,
  fotoUrl,
  iniziali,
  ora,
  prossimeSerate,
} from "@/lib/papion-pr";

/** Dove il telefono tiene l'ultima copia: in cassa il campo va e viene. */
const COPIA = (l: string) => `papion_pr_${l}`;

const MONT = { fontFamily: "var(--font-mont), system-ui, sans-serif" } as const;

type Telefono = "ios" | "android" | "altro";
type RichiestaInstallazione = Event & { prompt: () => Promise<void> };

function chiTelefono(): { tipo: Telefono; dentroApp: boolean; installata: boolean } {
  if (typeof window === "undefined") return { tipo: "altro", dentroApp: false, installata: false };
  const ua = navigator.userAgent;
  const tipo: Telefono = /iPhone|iPad|iPod/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : "altro";
  const dentroApp = /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Snapchat|WhatsApp/i.test(ua);
  const installata =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { tipo, dentroApp, installata };
}

/**
 * L'APP DEL PR DEL PAPI-ON (script 61).
 *
 * La prima cosa è il QR: si apre l'icona e lo si mostra, in cassa (entra
 * gratis, si segna la presenza, si carica il drink) e al bar (drink,
 * shot ogni 5 presenze, 1 € di sconto). Sotto: stasera, la tessera a
 * battiti, i numeri, i tavoli. Chi ha il link è lui: niente accesso.
 * Si aggiorna da sola ogni 20 secondi e regge anche senza campo.
 */
export default function AppPRPage({ params }: { params: Promise<{ link: string }> }) {
  const { link } = use(params);
  const [d, setD] = useState<AppPR | null>(null);
  const [letto, setLetto] = useState(false);
  const [copiaDel, setCopiaDel] = useState<string | null>(null);
  const [senzaRete, setSenzaRete] = useState(false);
  const [tel] = useState(chiTelefono);
  const [installa, setInstalla] = useState<RichiestaInstallazione | null>(null);

  const leggi = useCallback(async () => {
    const { data, error } = await createClient().rpc("papion_pr_app", {
      p_link: link,
      p_icona: tel.installata,
    });
    if (error) {
      // Niente rete: l'ultima copia, così il QR si mostra lo stesso
      try {
        const c = JSON.parse(localStorage.getItem(COPIA(link)) ?? "null");
        if (c?.d) {
          setD(c.d as AppPR);
          setCopiaDel(c.at as string);
        } else setSenzaRete(true);
      } catch {
        setSenzaRete(true);
      }
      setLetto(true);
      return;
    }
    const app = (data as AppPR | null) ?? null;
    setD(app);
    setCopiaDel(null);
    setSenzaRete(false);
    setLetto(true);
    try {
      if (app) localStorage.setItem(COPIA(link), JSON.stringify({ d: app, at: new Date().toISOString() }));
      else localStorage.removeItem(COPIA(link)); // link tolto da Luka: niente copie in giro
    } catch {
      // memoria piena o vietata: si va avanti con la rete
    }
  }, [link, tel.installata]);

  useEffect(() => {
    leggi();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") leggi();
    }, 20000);
    const torna = () => {
      if (document.visibilityState === "visible") leggi();
    };
    document.addEventListener("visibilitychange", torna);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", torna);
    };
  }, [leggi]);

  // Si apre anche senza campo (public/sw-papion-pr.js), e su Android il
  // browser offre "Installa" solo se qualcuno lo chiede.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw-papion-pr.js", { scope: "/papion/pr/" }).catch(() => {});
    }
    const prendi = (e: Event) => {
      e.preventDefault();
      setInstalla(e as RichiestaInstallazione);
    };
    window.addEventListener("beforeinstallprompt", prendi);
    return () => window.removeEventListener("beforeinstallprompt", prendi);
  }, []);

  if (!letto) {
    return (
      <main className="flex min-h-[100dvh] flex-1 items-center justify-center">
        <Battito pieni={0} ogni={5} piccolo />
      </main>
    );
  }

  if (!d && senzaRete) {
    return (
      <Vuota titolo="Senza connessione">
        Non riesco a collegarmi. Riprova appena hai campo: l&apos;app si aggiorna da sola.
      </Vuota>
    );
  }

  if (!d) {
    return (
      <Vuota titolo="Link non valido">
        Questo link non apre nessuna app PR. Se Luka ti ha mandato un link nuovo, usa quello: il vecchio non
        funziona più.
      </Vuota>
    );
  }

  return (
    <main
      className="mx-auto w-full max-w-md flex-1 px-4 pb-16"
      style={{ paddingTop: "max(env(safe-area-inset-top), 14px)" }}
    >
      {/* Testa: il marchio del locale, e chi sei */}
      <header className="flex items-center justify-between py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_PAPION} alt="PAPI-ON" width={124} height={32} style={{ width: 124, height: "auto" }} />
        <span
          className="border border-white/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/80"
          style={MONT}
        >
          PR
        </span>
      </header>

      {copiaDel && (
        <p className="mt-3 border border-white/15 px-3 py-2 text-[11px] text-white/60">
          Senza campo: è la copia delle {ora(copiaDel)}. Il QR vale lo stesso.
        </p>
      )}

      {!tel.installata && tel.tipo !== "altro" && (
        <Installa tipo={tel.tipo} dentroApp={tel.dentroApp} installa={installa} onFatto={() => setInstalla(null)} />
      )}

      <Pass d={d} link={link} onFoto={leggi} />

      <StaseraBox d={d} />

      <Tessera d={d} />

      <Sconto stasera={d.sconti_stasera} />

      <Tavoli d={d} link={link} onCambio={leggi} />

      <Scontrino d={d} />

      {d.storico.length > 0 && <Serate d={d} />}

      {d.prevendite_1p && (
        <Link
          href="/pr"
          className="mt-8 flex items-center justify-between border border-white/20 px-4 py-4 text-white"
        >
          <span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.3em] text-white/50" style={MONT}>
              fai anche le prevendite 1%
            </span>
            <span className="mt-1 block text-[15px] font-semibold" style={MONT}>
              Le tue prevendite
            </span>
          </span>
          <span aria-hidden className="text-xl">
            →
          </span>
        </Link>
      )}

      <footer className="mt-12 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.45em] text-white/35" style={MONT}>
          music club · roveredo in piano
        </p>
      </footer>
    </main>
  );
}

/* ─────────────────────────────── IL PASS ─────────────────────────────── */

function Pass({ d, link, onFoto }: { d: AppPR; link: string; onFoto: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [carico, setCarico] = useState(false);
  const [erroreFoto, setErroreFoto] = useState<string | null>(null);
  const [fotoRotta, setFotoRotta] = useState(false);
  const dentro = d.stasera !== null;
  const foto = fotoUrl(d.foto);

  useEffect(() => {
    if (!canvasRef.current) return;
    const lato = Math.min(272, Math.max(200, window.innerWidth - 120));
    QRCode.toCanvas(canvasRef.current, d.qr, {
      width: lato,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    });
  }, [d.qr]);

  async function caricaFoto(f: File) {
    setErroreFoto(null);
    setCarico(true);
    try {
      const piccola = await downscaleImage(f, 1024, 0.88);
      const form = new FormData();
      form.append("link", link);
      form.append("file", piccola, "foto.jpg");
      const r = await fetch("/api/papion-pr/foto", { method: "POST", body: form });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErroreFoto(j.error === "r2-non-configurato" ? "Foto non disponibili adesso." : "Foto non caricata, riprova.");
      } else {
        setFotoRotta(false);
        onFoto();
      }
    } catch {
      setErroreFoto("Foto non caricata: controlla il campo e riprova.");
    } finally {
      setCarico(false);
    }
  }

  return (
    <section
      className="relative mt-4 overflow-hidden border px-5 pb-14 pt-5"
      style={{
        borderColor: dentro ? `${ROSSO_PAPION}aa` : "rgba(255,255,255,0.14)",
        background: "linear-gradient(180deg, #131316 0%, #09090a 100%)",
        boxShadow: dentro ? `0 0 42px -8px ${ROSSO_PAPION}88` : "none",
      }}
    >
      {/* il battito del logo sul fondo del pass: fermo fuori, scorre come un monitor quando è dentro */}
      <svg
        aria-hidden
        viewBox="0 0 400 40"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 bottom-2 h-9 w-full"
      >
        <path
          d="M0 22 H150 L160 12 L170 32 L184 2 L198 36 L210 16 L218 22 H400"
          fill="none"
          stroke={ROSSO_PAPION}
          strokeWidth="2"
          strokeOpacity={dentro ? 0.9 : 0.35}
          className={dentro ? "ppr-traccia" : undefined}
        />
      </svg>

      <div className="relative flex items-center gap-4">
        <button
          onClick={() => fileRef.current?.click()}
          className="relative shrink-0 rounded-full p-[3px]"
          style={{ background: dentro ? ROSSO_PAPION : "rgba(255,255,255,0.18)" }}
          aria-label={foto ? "Cambia la foto" : "Aggiungi la tua foto"}
        >
          <span className="block h-[68px] w-[68px] overflow-hidden rounded-full bg-[#1c1c20]">
            {foto && !fotoRotta ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={foto}
                alt=""
                width={68}
                height={68}
                style={{ width: 68, height: 68, objectFit: "cover" }}
                onError={() => setFotoRotta(true)}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xl font-extrabold text-white/80" style={MONT}>
                {iniziali(d.nome, d.cognome)}
              </span>
            )}
          </span>
          {!foto && (
            <span
              className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-bold text-black"
              aria-hidden
            >
              +
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void caricaFoto(f);
          }}
        />
        <div className="min-w-0">
          <h1 className="text-[26px] font-black uppercase leading-[0.95] tracking-[-0.01em] text-white" style={MONT}>
            {d.nome}
            {d.cognome && <span className="block text-white/85">{d.cognome}</span>}
          </h1>
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45" style={MONT}>
            {carico ? "carico la foto…" : !foto ? "tocca il cerchio · metti la foto" : "pr · papi-on"}
          </p>
        </div>
      </div>
      {erroreFoto && <p className="relative mt-3 text-[12px] text-[#ff6b6b]">{erroreFoto}</p>}

      <div className="relative mt-9 flex justify-center">
        <div className="bg-white p-3">
          <canvas ref={canvasRef} className="block" />
        </div>
      </div>
      <p className="relative mt-4 text-center text-[13px] font-bold uppercase tracking-[0.22em] text-white" style={MONT}>
        Mostralo in cassa e al bar
      </p>
      <p className="relative mt-1 text-center font-tech text-[10px] tracking-[0.15em] text-white/30">
        {d.qr.slice(-6).toUpperCase()}
      </p>
    </section>
  );
}

/* ─────────────────────────────── STASERA ─────────────────────────────── */

function StaseraBox({ d }: { d: AppPR }) {
  const s = d.stasera;
  return (
    <section className="mt-6">
      <Etichetta>stasera · {dataCorta(d.serata)}</Etichetta>

      {!s ? (
        <p className="mt-2 border-l-2 pl-3 text-[14px] leading-relaxed text-white/80" style={{ borderColor: ROSSO_PAPION }}>
          In cassa fai scansionare il QR: <strong className="text-white">entri gratis</strong> e ti si carica il{" "}
          <strong className="text-white">drink omaggio</strong>.
        </p>
      ) : (
        <>
          <p className="mt-2 flex items-center gap-2 text-[13px] text-white/70">
            <span className="ppr-luce inline-block h-2 w-2 rounded-full" style={{ background: ROSSO_PAPION }} aria-hidden />
            Dentro dalle <span className="font-tech text-white">{ora(s.entrato_at)}</span>
            <span className="text-white/40">· presenza n. {s.numero}</span>
          </p>
          <div className={`mt-3 grid gap-2 ${s.shot ? "grid-cols-2" : "grid-cols-1"}`}>
            <Omaggio cosa="Drink omaggio" icona="🍸" preso={s.drink_at} />
            {s.shot && <Omaggio cosa="Shot omaggio" icona="🥃" preso={s.shot_at} />}
          </div>
        </>
      )}
    </section>
  );
}

function Omaggio({ cosa, icona, preso }: { cosa: string; icona: string; preso: string | null }) {
  const pronto = !preso;
  return (
    <div
      className="px-4 py-3.5"
      style={
        pronto
          ? { background: ROSSO_PAPION, color: "#fff" }
          : { border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.5)" }
      }
    >
      <p className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.25em]" style={MONT}>
        {cosa}
        <span aria-hidden className={pronto ? "" : "grayscale"}>
          {icona}
        </span>
      </p>
      <p className="mt-1.5 text-[19px] font-black uppercase leading-none" style={MONT}>
        {pronto ? "pronto" : `preso · ${ora(preso!)}`}
      </p>
      {pronto && <p className="mt-1.5 text-[11px] leading-snug text-white/85">Fai scansionare il QR al bar</p>}
    </div>
  );
}

/* ─────────────────────────── LA TESSERA A BATTITI ─────────────────────────── */

function Tessera({ d }: { d: AppPR }) {
  const { pieni, mancano } = bollini(d.presenze, d.ogni);
  const shotStasera = d.stasera?.shot ?? false;
  return (
    <section className="mt-8">
      <div className="flex items-end justify-between">
        <Etichetta>la tua tessera</Etichetta>
        <span className="font-tech text-[12px] text-white/60">
          <span className="text-white">{pieni}</span> / {d.ogni}
        </span>
      </div>
      <div className="mt-3">
        <Battito pieni={pieni} ogni={d.ogni} />
      </div>
      <p className="mt-3 text-[14px] leading-snug text-white/80">
        {shotStasera ? (
          <>
            <strong className="text-white">Tessera piena: stasera lo shot è tuo.</strong> Fallo scansionare al bar.
          </>
        ) : pieni === d.ogni ? (
          <>Tessera piena: lo shot era della {d.ogni}ª serata. Si riparte.</>
        ) : (
          <>
            Ancora <strong className="text-white">{mancano}</strong> {mancano === 1 ? "serata" : "serate"} e hai lo{" "}
            <strong className="text-white">shot omaggio</strong>. Ogni serata conta quando passi dalla cassa.
          </>
        )}
      </p>
    </section>
  );
}

/**
 * Il segno del PAPI-ON diventa la tessera: un battito per ogni presenza.
 * Quelli fatti sono rossi, quelli da fare sono il tracciato spento.
 */
function Battito({ pieni, ogni, piccolo }: { pieni: number; ogni: number; piccolo?: boolean }) {
  const w = 64;
  const beat = (x: number) => `M${x} 34 H${x + 14} L${x + 20} 26 L${x + 26} 46 L${x + 34} 6 L${x + 42} 42 L${x + 47} 30 L${x + 51} 34 H${x + w}`;
  return (
    <svg
      viewBox={`0 0 ${w * ogni} 56`}
      className={piccolo ? "w-40" : "w-full"}
      role={piccolo ? undefined : "img"}
      aria-label={piccolo ? undefined : `${pieni} serate su ${ogni}`}
      aria-hidden={piccolo || undefined}
    >
      {Array.from({ length: ogni }, (_, i) => {
        const acceso = i < pieni;
        return (
          <g key={i}>
            <path
              d={beat(i * w)}
              fill="none"
              stroke={acceso ? ROSSO_PAPION : "#2a2a2f"}
              strokeWidth={acceso ? 3 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={acceso ? { filter: `drop-shadow(0 0 5px ${ROSSO_PAPION})` } : undefined}
              className={piccolo ? "ppr-carica" : undefined}
            />
            {!piccolo && (
              <text
                x={i * w + 34}
                y={55}
                textAnchor="middle"
                fontSize="8"
                fill={acceso ? "#ffffff" : "#55555c"}
                style={{ fontFamily: "var(--font-jet), monospace", letterSpacing: "0.1em" }}
              >
                {i === ogni - 1 ? "SHOT" : i + 1}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ─────────────────────────────── LO SCONTO ─────────────────────────────── */

function Sconto({ stasera }: { stasera: number }) {
  return (
    <section className="mt-8 flex items-stretch gap-4 border border-white/12 px-4 py-4">
      <div className="flex shrink-0 flex-col items-center justify-center pr-1">
        <span className="text-[34px] font-black leading-none text-white" style={MONT}>
          −{SCONTO_EURO}€
        </span>
        <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.3em] text-white/45" style={MONT}>
          al bar
        </span>
      </div>
      <div className="border-l border-white/12 pl-4">
        <p className="text-[13px] leading-relaxed text-white/80">
          Sui drink da {SCONTO_DA} € in su: <strong className="text-white">prima dello scontrino</strong> fai
          scansionare il QR. Un drink alla volta.
        </p>
        {stasera > 0 && (
          <p className="mt-1.5 font-tech text-[11px] text-white/50">
            stasera: {stasera} {stasera === 1 ? "sconto" : "sconti"}
          </p>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────────── I TAVOLI ─────────────────────────────── */

const ERRORI_TAVOLO: Record<string, string> = {
  data: "Scegli una sera da stasera in avanti.",
  nome: "Scrivi a nome di chi è il tavolo.",
  vuoto: "Metti il budget o le bottiglie.",
  budget: "Il budget è in euro, solo numeri.",
  troppi: "Su quella sera hai già segnato troppi tavoli: parla con Luka.",
  link: "L'app non è più valida: chiedi a Luka il link nuovo.",
};

function Tavoli({ d, link, onCambio }: { d: AppPR; link: string; onCambio: () => void }) {
  const [aperto, setAperto] = useState(false);
  const [vecchiAperti, setVecchiAperti] = useState(false);
  const prossimi = d.tavoli.filter((t) => t.serata >= d.serata).sort((a, b) => a.serata.localeCompare(b.serata));
  const passati = d.tavoli.filter((t) => t.serata < d.serata);

  return (
    <section className="mt-8">
      <div className="flex items-end justify-between">
        <Etichetta>i miei tavoli</Etichetta>
        {!aperto && (
          <button
            onClick={() => setAperto(true)}
            className="text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ ...MONT, color: ROSSO_PAPION }}
          >
            + segna un tavolo
          </button>
        )}
      </div>

      {aperto && (
        <NuovoTavolo
          serata={d.serata}
          link={link}
          onChiudi={() => setAperto(false)}
          onFatto={() => {
            setAperto(false);
            onCambio();
          }}
        />
      )}

      {prossimi.length === 0 && !aperto && (
        <p className="mt-2 text-[13px] text-white/50">Nessun tavolo per le prossime sere.</p>
      )}

      <ul className="mt-2 divide-y divide-white/[0.08]">
        {prossimi.map((t) => (
          <RigaTavolo key={t.id} t={t} link={link} stasera={d.serata} onCambio={onCambio} />
        ))}
      </ul>

      {passati.length > 0 && (
        <>
          <button
            onClick={() => setVecchiAperti((v) => !v)}
            className="mt-3 font-tech text-[10px] uppercase tracking-[0.2em] text-white/40"
          >
            {vecchiAperti ? "nascondi" : `serate passate · ${passati.length}`}
          </button>
          {vecchiAperti && (
            <ul className="mt-1 divide-y divide-white/[0.06] opacity-70">
              {passati.map((t) => (
                <RigaTavolo key={t.id} t={t} link={link} stasera={d.serata} onCambio={onCambio} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function RigaTavolo({
  t,
  link,
  stasera,
  onCambio,
}: {
  t: TavoloPR;
  link: string;
  stasera: string;
  onCambio: () => void;
}) {
  const [via, setVia] = useState(false);
  const togliibile = t.stato === "segnato" && t.serata >= stasera;
  async function togli() {
    if (!window.confirm(`Togliere il tavolo di ${t.nome}?`)) return;
    setVia(true);
    const { data } = await createClient().rpc("papion_pr_tavolo_togli", { p_link: link, p_id: t.id });
    if (data !== "ok") {
      setVia(false);
      window.alert("Non si può più togliere: parlane con Luka.");
      return;
    }
    onCambio();
  }
  return (
    <li className={`flex items-start justify-between gap-3 py-3 ${via ? "opacity-40" : ""}`}>
      <div className="min-w-0">
        <p className="font-tech text-[10px] uppercase tracking-[0.15em] text-white/45">{dataCorta(t.serata)}</p>
        <p className="mt-0.5 truncate text-[16px] font-bold text-white" style={MONT}>
          {t.nome}
        </p>
        <p className="mt-0.5 text-[12px] text-white/60">
          {[t.budget ? `${t.budget} €` : null, t.bottiglie].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span
          className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.2em]"
          style={{
            ...MONT,
            ...(t.stato === "venuto"
              ? { background: ROSSO_PAPION, color: "#fff" }
              : t.stato === "non_venuto"
                ? { border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.4)" }
                : { border: "1px solid rgba(255,255,255,0.3)", color: "rgba(255,255,255,0.8)" }),
          }}
        >
          {t.stato === "venuto" ? "venuto ✓" : t.stato === "non_venuto" ? "non venuto" : "segnato"}
        </span>
        {togliibile && (
          <button onClick={togli} className="font-tech text-[10px] uppercase tracking-[0.15em] text-white/40">
            togli
          </button>
        )}
      </div>
    </li>
  );
}

function NuovoTavolo({
  serata,
  link,
  onChiudi,
  onFatto,
}: {
  serata: string;
  link: string;
  onChiudi: () => void;
  onFatto: () => void;
}) {
  const sere = prossimeSerate(serata);
  const [quando, setQuando] = useState(sere[0]);
  const [nome, setNome] = useState("");
  const [budget, setBudget] = useState("");
  const [bottiglie, setBottiglie] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  async function segna(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    const b = budget.trim() === "" ? null : Number(budget.replace(/[^\d]/g, ""));
    if (budget.trim() !== "" && (!b || !Number.isFinite(b))) {
      setErrore(ERRORI_TAVOLO.budget);
      return;
    }
    setInvio(true);
    const { data, error } = await createClient().rpc("papion_pr_tavolo", {
      p_link: link,
      p_serata: quando,
      p_nome: nome,
      p_budget: b,
      p_bottiglie: bottiglie,
    });
    setInvio(false);
    if (error) {
      setErrore(error.code ? error.message : "Niente campo: riprova appena c'è rete.");
      return;
    }
    const esito = String(data ?? "");
    if (esito.startsWith("ok:")) onFatto();
    else setErrore(ERRORI_TAVOLO[esito] ?? "Tavolo non segnato, riprova.");
  }

  const campo =
    "w-full border-b border-white/20 bg-transparent pb-2 pt-1 text-[16px] text-white placeholder-white/30 outline-none focus:border-white";

  return (
    <form onSubmit={segna} className="mt-3 border border-white/15 bg-white/[0.03] px-4 py-4" noValidate>
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50" style={MONT}>
        per che sera
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {sere.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setQuando(s)}
            className="px-2.5 py-2 text-[12px] font-semibold"
            style={
              quando === s
                ? { ...MONT, background: "#fff", color: "#000" }
                : { ...MONT, border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.75)" }
            }
          >
            {i === 0 ? "stasera" : dataCorta(s)}
          </button>
        ))}
        <label
          className="relative px-2.5 py-2 text-[12px] font-semibold"
          style={
            !sere.includes(quando)
              ? { ...MONT, background: "#fff", color: "#000" }
              : { ...MONT, border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.75)" }
          }
        >
          {sere.includes(quando) ? "altra data" : dataCorta(quando)}
          <input
            type="date"
            min={serata}
            className="absolute inset-0 opacity-0"
            onChange={(e) => e.target.value && setQuando(e.target.value)}
            aria-label="Scegli un'altra data"
          />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-white/45">{dataLunga(quando)}</p>

      <label className="mt-4 block">
        <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50" style={MONT}>
          a nome di
        </span>
        <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} className={campo} placeholder="es. Marco Bianchi" />
      </label>

      <div className="mt-4 grid grid-cols-[110px_1fr] gap-4">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50" style={MONT}>
            budget €
          </span>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            inputMode="numeric"
            className={campo}
            placeholder="300"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50" style={MONT}>
            bottiglie
          </span>
          <input
            value={bottiglie}
            onChange={(e) => setBottiglie(e.target.value)}
            maxLength={200}
            className={campo}
            placeholder="es. Belvedere + Moët"
          />
        </label>
      </div>

      {errore && <p className="mt-3 text-[12px] text-[#ff6b6b]">{errore}</p>}

      <div className="mt-5 flex gap-2">
        <button
          type="submit"
          disabled={invio}
          className="flex-1 py-3.5 text-[13px] font-extrabold uppercase tracking-[0.15em] text-white disabled:opacity-50"
          style={{ ...MONT, background: ROSSO_PAPION }}
        >
          {invio ? "segno…" : "Segna il tavolo"}
        </button>
        <button
          type="button"
          onClick={onChiudi}
          className="border border-white/20 px-4 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/70"
          style={MONT}
        >
          annulla
        </button>
      </div>
    </form>
  );
}

/* ─────────────────────────── LO SCONTRINO DEL PR ─────────────────────────── */

function Scontrino({ d }: { d: AppPR }) {
  const righe: [string, string][] = [
    ["presenze", String(d.presenze)],
    ["drink omaggio", String(d.drink)],
    ["shot omaggio", String(d.shot)],
    ["sconti al bar", d.sconti ? `${d.sconti} × −${SCONTO_EURO} €` : "0"],
    ["tavoli portati", String(d.tavoli_tot)],
  ];
  return (
    <section className="mt-10">
      <Etichetta>i tuoi numeri</Etichetta>
      <div className="mt-3 bg-[#f4f2ec] px-4 pb-5 pt-4 text-[#111] [clip-path:polygon(0_0,100%_0,100%_calc(100%-8px),96%_100%,92%_calc(100%-8px),88%_100%,84%_calc(100%-8px),80%_100%,76%_calc(100%-8px),72%_100%,68%_calc(100%-8px),64%_100%,60%_calc(100%-8px),56%_100%,52%_calc(100%-8px),48%_100%,44%_calc(100%-8px),40%_100%,36%_calc(100%-8px),32%_100%,28%_calc(100%-8px),24%_100%,20%_calc(100%-8px),16%_100%,12%_calc(100%-8px),8%_100%,4%_calc(100%-8px),0_100%)]">
        <p className="text-center font-tech text-[10px] uppercase tracking-[0.3em] text-black/50">
          papi-on · pr · {d.nome}
        </p>
        <ul className="mt-3 space-y-1.5 font-tech text-[12px] uppercase">
          {righe.map(([k, v]) => (
            <li key={k} className="flex items-baseline gap-2">
              <span>{k}</span>
              <span className="flex-1 translate-y-[-3px] border-b border-dotted border-black/35" aria-hidden />
              <span className="font-bold">{v}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-center font-tech text-[10px] uppercase tracking-[0.2em] text-black/45">
          pr dal {new Date(d.dal).toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
        </p>
      </div>
    </section>
  );
}

/* ─────────────────────────────── LE SERATE ─────────────────────────────── */

function Serate({ d }: { d: AppPR }) {
  return (
    <section className="mt-10">
      <Etichetta>le tue serate</Etichetta>
      <ul className="mt-2 divide-y divide-white/[0.07]">
        {d.storico.map((s) => (
          <li key={s.serata} className="flex items-center justify-between py-2.5">
            <span className="text-[14px] text-white/85">{dataCorta(s.serata)}</span>
            <span className="flex items-center gap-3 font-tech text-[11px] text-white/45">
              <span className={s.drink ? "" : "opacity-30 grayscale"} title="drink omaggio">
                🍸
              </span>
              {s.shot && (
                <span className={s.shot_preso ? "" : "opacity-30 grayscale"} title="shot omaggio">
                  🥃
                </span>
              )}
              <span className="w-8 text-right">n.{s.numero}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─────────────────────────────── PEZZI ─────────────────────────────── */

function Etichetta({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/45" style={MONT}>
      {children}
    </p>
  );
}

function Vuota({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] flex-1 flex-col items-center justify-center px-8 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_PAPION} alt="PAPI-ON" width={140} height={36} style={{ width: 140, height: "auto" }} />
      <p className="mt-10 text-2xl font-black uppercase text-white" style={MONT}>
        {titolo}
      </p>
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/60">{children}</p>
    </main>
  );
}

function Installa({
  tipo,
  dentroApp,
  installa,
  onFatto,
}: {
  tipo: Telefono;
  dentroApp: boolean;
  installa: RichiestaInstallazione | null;
  onFatto: () => void;
}) {
  return (
    <section className="mt-3 border px-4 py-4" style={{ borderColor: `${ROSSO_PAPION}99`, background: `${ROSSO_PAPION}14` }}>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ICONA_PPR_180} alt="" width={46} height={46} style={{ width: 46, height: 46 }} className="shrink-0 rounded-[11px]" />
        <div>
          <p className="text-[15px] font-extrabold uppercase leading-tight text-white" style={MONT}>
            Prima cosa: mettila sulla Home
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-white/70">
            Diventa l&apos;icona PAPI-ON: la apri al volo e sei sempre dentro.
          </p>
        </div>
      </div>

      {dentroApp ? (
        <p className="mt-3 text-[13px] leading-relaxed text-white/85">
          Sei dentro un&apos;altra app: tocca <strong>•••</strong> o <strong>⋮</strong> in alto e poi{" "}
          <strong>«Apri in {tipo === "ios" ? "Safari" : "Chrome"}»</strong>. Da lì la aggiungi alla schermata Home.
        </p>
      ) : tipo === "ios" ? (
        <p className="mt-3 text-[13px] leading-relaxed text-white/85">
          Tocca{" "}
          <span className="inline-flex translate-y-[3px] items-center" aria-label="Condividi">
            <IconaCondividi />
          </span>{" "}
          <strong>Condividi</strong> nella barra di Safari, poi <strong>«Aggiungi alla schermata Home»</strong>.
          Poi apri l&apos;app dall&apos;icona.
        </p>
      ) : installa ? (
        <button
          onClick={async () => {
            await installa.prompt();
            onFatto();
          }}
          className="mt-3 w-full bg-white px-4 py-3.5 text-[14px] font-extrabold uppercase text-black"
          style={MONT}
        >
          Aggiungi alla schermata Home
        </button>
      ) : (
        <p className="mt-3 text-[13px] leading-relaxed text-white/85">
          Tocca <strong>⋮</strong> in alto a destra, poi <strong>«Aggiungi a schermata Home»</strong> (o{" "}
          <strong>«Installa app»</strong>).
        </p>
      )}
    </section>
  );
}

/** L'icona "Condividi" di Safari: quadrato aperto con la freccia in su. */
function IconaCondividi() {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" fill="none" stroke="#4da3ff" strokeWidth="1.8" aria-hidden>
      <path d="M9 13V1.5M5 5l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M6 8H3.5A1.5 1.5 0 0 0 2 9.5v8A1.5 1.5 0 0 0 3.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 14.5 8H12"
        strokeLinecap="round"
      />
    </svg>
  );
}
