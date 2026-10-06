"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import {
  INDIRIZZO_PAPION,
  LOCANDINA_STORIA,
  LOCANDINA_WEB,
  SLUG_MALDITA,
  type StatoRichiesta,
  oraRoma,
  riempi,
} from "@/lib/omaggio";

type Mia = {
  lista: string;
  nome: string;
  cognome: string;
  stato: StatoRichiesta;
  titolo: string;
  starts_at: string;
  valido_fino: string;
  qr: string | null;
  qr_stato: "attiva" | "usata" | "annullata" | null;
  entrata_at: string | null;
  minorenne: boolean;
  sorpresa_on: boolean;
  sorpresa_testo: string | null;
  ig_tag: string | null;
  shot_at: string | null;
};

/** Dove il telefono tiene l'ultima copia: in fila il campo va e viene. */
const COPIA = (t: string) => `maldita_mia_${t}`;

type Telefono = "ios" | "android" | "altro";

type RichiestaInstallazione = Event & { prompt: () => Promise<void> };

function chiTelefono(): { tipo: Telefono; dentroApp: boolean; installata: boolean } {
  if (typeof window === "undefined") return { tipo: "altro", dentroApp: false, installata: false };
  const ua = navigator.userAgent;
  const tipo: Telefono = /iPhone|iPad|iPod/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : "altro";
  // Dentro Instagram, Facebook o TikTok "Aggiungi a Home" non c'è
  const dentroApp = /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Snapchat/i.test(ua);
  const installata =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { tipo, dentroApp, installata };
}

/**
 * La pagina personale: il link è l'indirizzo, nessuna iscrizione.
 *
 * Dice a che punto è la prenotazione e, quando è confermata, mostra il
 * QR da far scansionare in cassa. Si aggiorna da sola: se Luka approva
 * mentre lei ha la pagina aperta, il QR compare senza ricaricare.
 * Quando Luka accende la sorpresa, qui compare lo shot.
 */
export default function MiaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [m, setM] = useState<Mia | null>(null);
  const [letto, setLetto] = useState(false);
  const [adesso, setAdesso] = useState(() => Date.now());
  const [copiato, setCopiato] = useState(false);
  const [shotErr, setShotErr] = useState<string | null>(null);
  // senza rete si mostra l'ultima copia salvata, e si dice di quando è
  const [copiaDel, setCopiaDel] = useState<string | null>(null);
  const [senzaRete, setSenzaRete] = useState(false);
  // il telefono non cambia mentre la pagina è aperta: si legge una volta
  const [tel] = useState(chiTelefono);
  const [installa, setInstalla] = useState<RichiestaInstallazione | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let vivo = true;
    async function leggi() {
      const { data, error } = await supabase.rpc("omaggio_mia", { p_token: token });
      if (!vivo) return;
      if (error) {
        // Niente rete: l'ultima copia, così il QR si mostra lo stesso
        try {
          const c = JSON.parse(localStorage.getItem(COPIA(token)) ?? "null");
          if (c?.m) {
            setM(c.m as Mia);
            setCopiaDel(c.at as string);
          } else setSenzaRete(true);
        } catch {
          setSenzaRete(true);
        }
        setLetto(true);
        setAdesso(Date.now());
        return;
      }
      const riga = (data?.[0] as Mia) ?? null;
      setM(riga);
      setCopiaDel(null);
      setSenzaRete(false);
      setLetto(true);
      setAdesso(Date.now());
      if (riga) {
        try {
          localStorage.setItem(COPIA(token), JSON.stringify({ m: riga, at: new Date().toISOString() }));
          localStorage.setItem("maldita_mio_token", token);
        } catch {
          // memoria piena o vietata: la pagina va lo stesso, con la rete
        }
      }
    }
    leggi();
    const t = setInterval(leggi, 20000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [token]);

  // La pagina si apre anche senza campo (public/sw-maldita.js), e su
  // Android il browser offre "Installa" solo se qualcuno lo chiede.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw-maldita.js", { scope: "/maldita/" }).catch(() => {});
    }
    const prendi = (e: Event) => {
      e.preventDefault();
      setInstalla(e as RichiestaInstallazione);
    };
    window.addEventListener("beforeinstallprompt", prendi);
    return () => window.removeEventListener("beforeinstallprompt", prendi);
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !m?.qr) return;
    QRCode.toCanvas(canvasRef.current, m.qr, {
      width: 250,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
  }, [m?.qr]);

  async function salvaLink() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Il mio ingresso · MALDITA", url });
        return;
      }
    } catch {
      // annullato: si prova a copiare
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2500);
    } catch {
      window.prompt("Copia questo link:", url);
    }
  }

  async function shot() {
    if (!window.confirm("Lo fa il barista: confermi che lo shot è stato dato?")) return;
    setShotErr(null);
    const { data, error } = await createClient().rpc("omaggio_shot", { p_token: token });
    const esito = (data?.[0] as { esito: string } | undefined)?.esito;
    if (error || !esito) return setShotErr("Il sito non risponde, riprova.");
    if (esito === "non_entrata") return setShotErr("Lo shot vale quando sei già dentro il locale.");
    if (esito === "no") return setShotErr("La sorpresa non è attiva.");
    const { data: d2 } = await createClient().rpc("omaggio_mia", { p_token: token });
    setM((d2?.[0] as Mia) ?? m);
  }

  if (!letto) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="font-tech text-[11px] uppercase tracking-[0.3em] text-white/40 animate-pulse">un attimo…</p>
      </main>
    );
  }

  if (!m && senzaRete) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-3xl uppercase text-white">Senza connessione</p>
        <p className="mt-3 max-w-xs text-sm text-white/60">
          Non riesco a collegarmi. Riprova appena hai campo: la pagina si aggiorna da sola.
        </p>
      </main>
    );
  }

  if (!m) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-3xl uppercase text-white">Link non valido</p>
        <p className="mt-3 max-w-xs text-sm text-white/60">
          Questo link non corrisponde a nessuna prenotazione. Controlla di averlo copiato per intero.
        </p>
        <Link href={`/${SLUG_MALDITA}`} className="mt-6 border border-white/25 px-5 py-3 font-tech text-[11px] uppercase tracking-[0.2em]">
          vai alla prenotazione
        </Link>
      </main>
    );
  }

  const scadenza = oraRoma(m.valido_fino);
  const scaduto = m.qr_stato === "attiva" && adesso > new Date(m.valido_fino).getTime();
  const entrata = m.qr_stato === "usata";
  const tag = m.ig_tag;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-16 pt-5">
      <div className="flex items-center gap-3">
        {/* Misure in style: in globals.css `img { height: auto }` sta fuori dai
            layer di Tailwind e batte h-24, quindi la miniatura usciva enorme. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LOCANDINA_WEB}
          alt=""
          width={54}
          height={96}
          style={{ width: 54, height: 96 }}
          className="shrink-0 border border-white/10 object-cover"
        />
        <div className="min-w-0">
          <p className="font-tech text-[10px] uppercase tracking-[0.3em] text-[#ff5a5f]">donna omaggio</p>
          <p className="mt-1 font-display text-2xl uppercase leading-none text-white">{m.titolo}</p>
          <p className="mt-1.5 text-[12px] text-white/60">sabato 17 ottobre · nuovo PAPI-ON</p>
        </div>
      </div>

      <h1 className="mt-7 font-display text-4xl uppercase leading-none text-white">
        {m.nome} {m.cognome}
      </h1>

      {/* LA LUCE: lo stato in un colore, si capisce senza leggere */}
      <Luce
        colore={
          entrata || (m.stato === "approvata" && !scaduto)
            ? "verde"
            : scaduto
              ? "rossa"
              : m.stato === "rifiutata"
                ? "spenta"
                : "gialla"
        }
        testo={
          entrata
            ? "sei dentro"
            : scaduto
              ? "scaduto"
              : m.stato === "approvata"
                ? "confermata"
                : m.stato === "lista_attesa"
                  ? "lista d'attesa"
                  : m.stato === "rifiutata"
                    ? "non confermata"
                    : "in attesa di conferma"
        }
      />

      {copiaDel && (
        <p className="mt-3 border border-white/15 px-3 py-2 text-[11px] text-white/60">
          Senza campo: ti mostro la copia salvata alle {oraRoma(copiaDel)}. Si aggiorna appena torna la rete.
        </p>
      )}

      {/* LO STATO */}
      {m.stato === "in_attesa" && (
        <Riquadro colore="ambra" titolo="Prenotazione ricevuta">
          Ora la confermiamo noi. Quando è confermata la luce diventa <strong>verde</strong> e il tuo QR
          compare <strong>qui, su questa pagina</strong>. Mettila sulla schermata Home per ritrovarla al volo.
        </Riquadro>
      )}

      {m.stato === "lista_attesa" && (
        <Riquadro colore="ambra" titolo="Sei in lista d'attesa">
          I posti omaggio sono tutti assegnati. Se se ne libera uno la luce diventa <strong>verde</strong> e il
          QR compare qui. Mettila sulla schermata Home per ritrovarla al volo.
        </Riquadro>
      )}

      {m.stato === "rifiutata" && (
        <Riquadro colore="grigio" titolo="Non confermata">
          Questa volta non siamo riusciti a confermare il tuo omaggio. Sabato puoi entrare comunque,
          pagando l&apos;ingresso. Ti aspettiamo.
        </Riquadro>
      )}

      {m.stato === "approvata" && m.qr && (
        <section className="mt-5 border border-white/12 bg-white/[0.03] px-4 pb-5 pt-4">
          <p
            className={`text-center font-tech text-[11px] uppercase tracking-[0.25em] ${
              entrata ? "text-emerald-300" : scaduto ? "text-white/50" : "text-emerald-300"
            }`}
          >
            {entrata ? `sei entrata alle ${oraRoma(m.entrata_at!)} ✓` : scaduto ? "scaduto" : "confermato · il tuo ingresso"}
          </p>
          <div className="mt-3 flex justify-center">
            <div className={`bg-white p-2 ${entrata || scaduto ? "opacity-25 grayscale" : ""}`}>
              <canvas ref={canvasRef} className="block" />
            </div>
          </div>
          <p className="mt-3 text-center font-display text-xl uppercase text-white">omaggio donna</p>

          {!entrata && (
            <div
              className={`mt-4 px-3 py-3 text-center ${
                scaduto ? "border border-white/15" : "border-2 border-[#e0181f] bg-[#e0181f]/10"
              }`}
            >
              <p className="font-display text-2xl uppercase leading-none text-white">
                {scaduto ? `Valeva fino alle ${scadenza}` : `Valido solo entro le ${scadenza}`}
              </p>
              <p className="mt-1.5 text-[12px] leading-snug text-white/75">
                {scaduto
                  ? `Dopo le ${scadenza} l'omaggio non vale più: l'ingresso si paga.`
                  : `Fai scansionare il QR in cassa prima delle ${scadenza}. Dopo si paga, senza eccezioni.`}
              </p>
            </div>
          )}

          {!entrata && !scaduto && (
            <ul className="mt-4 space-y-1.5 text-[12px] leading-relaxed text-white/70">
              <li>· Porta il <strong className="text-white">documento d&apos;identità vero, in mano</strong>: la foto non vale.</li>
              <li>· Il QR vale per te sola e una volta sola: uno screenshot girato a un&apos;amica non la fa entrare.</li>
              {m.minorenne && <li>· Hai meno di 18 anni: il documento te lo chiediamo di sicuro.</li>}
            </ul>
          )}
        </section>
      )}

      {!tel.installata && !entrata && m.stato !== "rifiutata" && tel.tipo !== "altro" && (
        <section className="mt-5 border border-white/20 bg-white/[0.04] px-4 py-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/maldita/apple-touch-icon.png"
              alt=""
              width={48}
              height={48}
              style={{ width: 48, height: 48 }}
              className="shrink-0 rounded-[11px]"
            />
            <div>
              <p className="font-display text-xl uppercase leading-none text-white">Mettila sulla schermata Home</p>
              <p className="mt-1 text-[12px] leading-snug text-white/65">
                Diventa un&apos;icona come un&apos;app: in fila la apri al volo, anche col campo scarso.
              </p>
            </div>
          </div>

          {tel.dentroApp ? (
            <p className="mt-3 text-[13px] leading-relaxed text-white/85">
              Sei dentro Instagram: tocca <strong>•••</strong> in alto a destra e poi{" "}
              <strong>«Apri nel browser»</strong>
              {tel.tipo === "ios" ? " (Safari)" : ""}. Da lì la aggiungi alla schermata Home.
            </p>
          ) : tel.tipo === "ios" ? (
            <p className="mt-3 text-[13px] leading-relaxed text-white/85">
              Tocca{" "}
              <span className="inline-flex translate-y-[3px] items-center" aria-label="Condividi">
                <IconaCondividi />
              </span>{" "}
              <strong>Condividi</strong> nella barra di Safari, poi <strong>«Aggiungi alla schermata Home»</strong>.
            </p>
          ) : installa ? (
            <button
              onClick={async () => {
                await installa.prompt();
                setInstalla(null);
              }}
              className="mt-3 w-full bg-white px-4 py-3.5 font-display text-lg uppercase text-black"
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
      )}

      {/* LA SORPRESA: compare quando Luka la accende */}
      {m.sorpresa_on && m.stato === "approvata" && (
        <section
          className="mt-5 border border-[#e0181f]/60 px-4 py-5"
          style={{ background: "linear-gradient(160deg, rgba(224,24,31,0.22), rgba(0,0,0,0) 70%)" }}
        >
          <p className="font-tech text-[10px] uppercase tracking-[0.3em] text-[#ff8a8e]">una sorpresa per te</p>
          <p className="mt-1 font-display text-3xl uppercase leading-none text-white">Uno shot offerto 🥃</p>
          {m.sorpresa_testo && (
            <p className="mt-3 text-[13px] leading-relaxed text-white/80">
              {riempi(m.sorpresa_testo, { nome: m.nome, tag })}
            </p>
          )}

          {!m.shot_at && (
            <a
              href={LOCANDINA_STORIA}
              download="MALDITA-PAPION-17-ottobre.jpg"
              className="mt-4 block w-full border border-white/30 px-4 py-3 text-center font-tech text-[11px] uppercase tracking-[0.2em] text-white"
            >
              ↓ scarica la locandina per la storia
            </a>
          )}

          {m.shot_at ? (
            <p className="mt-4 border border-emerald-400/50 bg-emerald-400/10 px-3 py-3 text-center font-tech text-[11px] uppercase tracking-[0.2em] text-emerald-300">
              shot ritirato alle {oraRoma(m.shot_at)} ✓
            </p>
          ) : entrata ? (
            <>
              <p className="mt-4 text-[12px] text-white/60">Al bar: fai vedere la storia e questa schermata.</p>
              <button
                onClick={shot}
                className="mt-2 w-full bg-white px-4 py-4 font-display text-lg uppercase text-black"
              >
                Il barista conferma lo shot
              </button>
            </>
          ) : (
            <p className="mt-3 text-[11px] text-white/45">Lo shot si ritira al bar, una volta entrata.</p>
          )}
          {shotErr && <p className="mt-2 text-[12px] text-[#ff8a8e]">{shotErr}</p>}
        </section>
      )}

      {!entrata && m.stato !== "rifiutata" && (
        <button
          onClick={salvaLink}
          className="mt-5 w-full border border-white/25 px-4 py-3.5 font-tech text-[11px] uppercase tracking-[0.2em] text-white"
        >
          {copiato ? "link copiato ✓" : "salva / condividi il link di questa pagina"}
        </button>
      )}

      <footer className="mt-10 text-center">
        <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-white/50">sabato 17 ottobre · dalle 23:00</p>
        <p className="mt-1 text-[11px] text-white/40">{INDIRIZZO_PAPION}</p>
      </footer>
    </main>
  );
}

function Luce({ colore, testo }: { colore: "verde" | "gialla" | "rossa" | "spenta"; testo: string }) {
  const c = {
    verde: { pallino: "#34d399", alone: "rgba(52,211,153,0.75)", scritta: "text-emerald-300" },
    gialla: { pallino: "#fbbf24", alone: "rgba(251,191,36,0.7)", scritta: "text-amber-200" },
    rossa: { pallino: "#e0181f", alone: "rgba(224,24,31,0.75)", scritta: "text-[#ff8a8e]" },
    spenta: { pallino: "#6b6b6b", alone: "transparent", scritta: "text-white/50" },
  }[colore];
  return (
    <div className="mt-3 inline-flex items-center gap-2.5 border border-white/12 bg-white/[0.03] px-3 py-2">
      <span
        className={`block h-3.5 w-3.5 rounded-full ${colore === "gialla" ? "animate-pulse" : ""}`}
        style={{ background: c.pallino, boxShadow: `0 0 12px 3px ${c.alone}` }}
        aria-hidden
      />
      <span className={`font-tech text-[11px] uppercase tracking-[0.2em] ${c.scritta}`}>{testo}</span>
    </div>
  );
}

/** L'icona "Condividi" di Safari: quadrato aperto con la freccia in su. */
function IconaCondividi() {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" fill="none" stroke="#4da3ff" strokeWidth="1.8" aria-hidden>
      <path d="M9 13V1.5M5 5l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 8H3.5A1.5 1.5 0 0 0 2 9.5v8A1.5 1.5 0 0 0 3.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 14.5 8H12" strokeLinecap="round" />
    </svg>
  );
}

function Riquadro({
  colore,
  titolo,
  children,
}: {
  colore: "ambra" | "grigio";
  titolo: string;
  children: React.ReactNode;
}) {
  const stile =
    colore === "ambra" ? "border-amber-400/50 bg-amber-400/[0.07] text-amber-200" : "border-white/20 bg-white/[0.03] text-white/70";
  return (
    <section className={`mt-5 border px-4 py-4 ${stile}`}>
      <p className="font-display text-2xl uppercase leading-none text-white">{titolo}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-white/75">{children}</p>
    </section>
  );
}
