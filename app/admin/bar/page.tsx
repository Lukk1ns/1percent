"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { preparaAudio, suonaAttenzione, suonaNo, suonaOk } from "@/lib/suoni";
import { OGNI_EXTRA, OGNI_PAGATI, QR_PAPION, SCONTI_MAX, SCONTO_DA, SCONTO_EURO, ora } from "@/lib/papion-pr";

/** Cosa gli spetta stasera (script 62): drink 1 o 2, shot 0, 1 o 2. Sconti, drink pagati e regali: script 66. */
type Scheda = {
  qr: string;
  esito: "ok" | "disattivo" | "sconosciuto";
  nome: string | null;
  cognome: string | null;
  entrato_at: string | null;
  drink_tot: number | null;
  drink_usati: number | null;
  drink_ultimo: string | null;
  shot_tot: number | null;
  shot_usati: number | null;
  shot_ultimo: string | null;
  sconti: number | null;
  ultimo_sconto: string | null;
  presenze: number | null;
  /** script 66 (col database al 62 non arrivano: valgono le costanti) */
  sconti_max?: number | null;
  pagati?: number | null;
  pagati_stasera?: number | null;
  regali?: number | null;
  ogni_pagati?: number | null;
};

type Cosa = "drink" | "shot" | "sconto";

type Fatto = {
  cosa: Cosa;
  /** pieno = sconti finiti stasera: si paga tutto, ma il drink conta per il regalo */
  esito: "ok" | "pieno" | "gia" | "niente_shot" | "disattivo" | "sconosciuto" | "rete" | "errore";
  quando: string | null;
  sconti: number | null;
  rimasti: number | null;
  /** drink pagati da sempre, dopo questo */
  pagati?: number | null;
  /** sconto/pieno: con questo ne ha pagati 10, 20… · drink: era quello in regalo */
  regalo?: boolean | null;
  regali?: number | null;
  nome: string;
};

type Scanner = {
  start: (
    camera: { facingMode: string },
    config: object,
    onSuccess: (t: string) => void,
    onError: (e: string) => void,
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
};

/**
 * IL BAR — i PR del PAPI-ON (script 61).
 *
 * Il barista scansiona il QR del PR e vede il nome, poi tocca una cosa sola:
 *   · DRINK OMAGGIO  — uno a sera, caricato quando entra (due alla 10ª, 20ª…);
 *   · SHOT OMAGGIO   — alla 5ª, 15ª… presenza uno, alla 10ª, 20ª… due;
 *   · SCONTO 1 €     — sul drink che sta pagando (da 7 € in su), uno
 *                       alla volta, 5 a serata: il barista lo toglie prima
 *                       dello scontrino. Dal 6° il tasto diventa DRINK PAGATO:
 *                       prezzo pieno, ma conta (script 66).
 *   · Ogni 10 drink pagati uno in regalo: esce dal tasto DRINK OMAGGIO,
 *     dopo quello della serata, e non scade.
 * Scansionare non segna niente: conta il tocco. Così un QR letto due
 * volte dalla fotocamera non regala niente.
 */
export default function BarPage() {
  const router = useRouter();
  const [autorizzato, setAutorizzato] = useState<boolean | null>(null);
  const [scheda, setScheda] = useState<Scheda | null>(null);
  const [fatto, setFatto] = useState<Fatto | null>(null);
  const [straniero, setStraniero] = useState(false);
  const [lettura, setLettura] = useState(false);
  const [invio, setInvio] = useState<Cosa | null>(null);
  const [camErrore, setCamErrore] = useState<string | null>(null);
  const [tentativoCam, setTentativoCam] = useState(0);
  const [errore, setErrore] = useState<string | null>(null);

  const scannerRef = useRef<Scanner | null>(null);
  const occupato = useRef(false);
  const ultimoQR = useRef<{ token: string; at: number }>({ token: "", at: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const libera = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    ultimoQR.current = { ...ultimoQR.current, at: Date.now() };
    setScheda(null);
    setFatto(null);
    setStraniero(false);
    setInvio(null);
    occupato.current = false;
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [{ data: staff }, { data: manager }] = await Promise.all([
        supabase.rpc("is_staff"),
        supabase.rpc("is_account_manager"),
      ]);
      if (!staff && !manager) {
        router.replace("/login?next=/admin/bar");
        return;
      }
      setAutorizzato(true);
    })();
  }, [router]);

  const leggi = useCallback(
    async (letto: string) => {
      occupato.current = true;
      ultimoQR.current = { token: letto, at: Date.now() };
      if (!QR_PAPION.test(letto)) {
        suonaNo();
        setStraniero(true);
        timer.current = setTimeout(libera, 3500);
        return;
      }
      setLettura(true);
      try {
        const { data, error } = await createClient().rpc("papion_pr_bar", { p_qr: letto });
        if (error) {
          setErrore(
            error.code === "PGRST202"
              ? "Manca lo script 61 sul database: chiama Luka."
              : error.code
                ? error.message
                : "Niente campo: riprova.",
          );
          suonaNo();
          timer.current = setTimeout(() => {
            setErrore(null);
            libera();
          }, 3000);
          return;
        }
        const r = data?.[0] as Omit<Scheda, "qr"> | undefined;
        if (!r) return libera();
        if (r.esito === "ok") suonaOk();
        else suonaNo();
        setScheda({ ...r, qr: letto });
        // se il barista non tocca niente, dopo 40 secondi si torna alla fotocamera
        timer.current = setTimeout(libera, 40000);
      } finally {
        setLettura(false);
      }
    },
    [libera],
  );

  async function usa(cosa: Cosa) {
    if (!scheda || invio) return;
    setInvio(cosa);
    if (timer.current) clearTimeout(timer.current);
    const nome = [scheda.nome, scheda.cognome].filter(Boolean).join(" ");
    let f: Fatto;
    try {
      const { data, error } = await createClient().rpc("papion_pr_bar_usa", { p_qr: scheda.qr, p_cosa: cosa });
      f = error
        ? { cosa, esito: error.code ? "errore" : "rete", quando: null, sconti: null, rimasti: null, nome }
        : {
            cosa,
            nome,
            ...((data?.[0] as Omit<Fatto, "cosa" | "nome">) ?? { esito: "rete", quando: null, sconti: null, rimasti: null }),
          };
    } catch {
      f = { cosa, esito: "rete", quando: null, sconti: null, rimasti: null, nome };
    }
    if (f.esito === "ok" || (cosa === "sconto" && f.esito === "gia")) suonaOk();
    else if (f.esito === "gia" || f.esito === "pieno") suonaAttenzione();
    else suonaNo();
    if (navigator.vibrate) navigator.vibrate(f.esito === "ok" ? 60 : [80, 60, 80]);
    setScheda(null);
    setFatto(f);
    setInvio(null);
    timer.current = setTimeout(libera, f.esito === "ok" && !f.regalo ? 2200 : 4500);
  }

  // La fotocamera sempre accesa, come in porta
  useEffect(() => {
    if (!autorizzato) return;
    let annullato = false;
    setCamErrore(null);

    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (annullato) return;
      const inst = new Html5Qrcode("bar-reader", {
        verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      }) as unknown as Scanner;
      scannerRef.current = inst;
      // Se dopo 6 secondi è ancora nera (fotocamera rimasta presa da
      // un'altra pagina), si dice di farla ripartire invece di restare al buio.
      const guardia = setTimeout(() => {
        if (!annullato) setCamErrore("La fotocamera non è partita. Tocca qui sopra; se resta nera, ricarica la pagina.");
      }, 6000);
      try {
        await inst.start(
          { facingMode: "environment" },
          {
            fps: 14,
            qrbox: (w: number, h: number) => {
              const s = Math.floor(Math.min(w, h) * 0.8);
              return { width: s, height: s };
            },
          },
          (letto: string) => {
            if (occupato.current) return;
            const t = letto.trim();
            const u = ultimoQR.current;
            if (t === u.token && Date.now() - u.at < 4000) return;
            void leggi(t);
          },
          () => {},
        );
        clearTimeout(guardia);
      } catch (e) {
        clearTimeout(guardia);
        if (!annullato) {
          const err = e as { name?: string; message?: string };
          setCamErrore(
            err?.name === "NotAllowedError"
              ? "Permesso alla fotocamera negato."
              : err?.name === "NotReadableError"
                ? "La fotocamera è occupata da un'altra app."
                : `${err?.name ?? "Errore"}: ${err?.message ?? "non si accende"}`,
          );
        }
      }
    })();

    return () => {
      annullato = true;
      const inst = scannerRef.current;
      scannerRef.current = null;
      if (inst) inst.stop().then(() => inst.clear()).catch(() => {});
    };
  }, [autorizzato, leggi, tentativoCam]);

  if (autorizzato === null) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="font-tech text-[11px] uppercase tracking-[0.3em] text-brand-gray animate-pulse">bar…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] flex-1 flex-col bg-black" onTouchStart={preparaAudio}>
      <div className="border-b border-l-4 border-b-white/10 border-l-[#E90A11] bg-black px-4 py-3">
        <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-[#ff6b6b]">bar · pr papi-on</p>
        <p className="mt-0.5 text-[12px] leading-snug text-brand-gray">
          Scansiona il QR del PR, poi tocca: drink omaggio, shot omaggio o sconto {SCONTO_EURO} € (drink da{" "}
          {SCONTO_DA} € in su, uno alla volta, {SCONTI_MAX} a sera). Ogni {OGNI_PAGATI} drink pagati ne ha uno in regalo.
        </p>
      </div>

      <div className="relative flex-1">
        <div id="bar-reader" className="h-full w-full [&_video]:h-full [&_video]:object-cover" />

        {camErrore && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <button
              onClick={() => window.location.reload()}
              className="w-full max-w-xs bg-brand-red px-6 py-4 text-sm font-semibold uppercase tracking-widest text-white"
            >
              Accendi la fotocamera
            </button>
            <p className="mt-3 text-[12px] leading-relaxed text-brand-gray">{camErrore}</p>
          </div>
        )}

        {lettura && (
          <div className="absolute inset-x-0 bottom-0 z-10 bg-black/80 px-4 py-4 text-center">
            <p className="font-display text-3xl uppercase leading-none text-white">QR letto · controllo…</p>
          </div>
        )}

        {errore && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-neutral-700 px-6 text-center text-white">
            <p className="font-display text-4xl uppercase">Nessuna risposta</p>
            <p className="mt-3 max-w-[28ch] text-sm">{errore}</p>
          </div>
        )}

        {straniero && (
          <button
            onClick={libera}
            className="absolute inset-0 z-20 flex w-full flex-col items-center justify-center bg-neutral-700 px-6 text-center text-white"
          >
            <p className="font-display text-5xl uppercase leading-none">Non è un PR</p>
            <p className="mt-4 max-w-[28ch] text-sm leading-relaxed">
              Qui si leggono solo i QR dei PR del PAPI-ON. Gli shot omaggio delle liste si leggono dalla Porta.
            </p>
            <a
              href="/admin/porta"
              onClick={(e) => e.stopPropagation()}
              className="mt-6 border-2 border-white px-6 py-3 text-[12px] font-semibold uppercase tracking-widest"
            >
              apri la porta
            </a>
          </button>
        )}

        {scheda && <SchedaPR s={scheda} invio={invio} onUsa={usa} onChiudi={libera} />}
        {fatto && <Esito f={fatto} onChiudi={libera} />}
      </div>

      <div className="flex gap-2 border-t border-white/10 bg-black px-4 py-3">
        <a
          href="/admin/porta"
          className="flex flex-1 items-center justify-center border border-white/15 py-3 font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray"
        >
          vai alla porta
        </a>
      </div>
    </main>
  );
}

/** Chi è e cosa gli spetta stasera: tre tasti grandi, uno per cosa. */
function SchedaPR({
  s,
  invio,
  onUsa,
  onChiudi,
}: {
  s: Scheda;
  invio: Cosa | null;
  onUsa: (c: Cosa) => void;
  onChiudi: () => void;
}) {
  const nome = [s.nome, s.cognome].filter(Boolean).join(" ");

  if (s.esito !== "ok") {
    return (
      <button
        onClick={onChiudi}
        className="absolute inset-0 z-20 flex w-full flex-col items-center justify-center bg-brand-red px-6 text-center text-white"
      >
        <p className="font-display text-5xl uppercase leading-none">
          {s.esito === "disattivo" ? "PR non attivo" : "QR non valido"}
        </p>
        {nome && <p className="mt-4 font-display text-3xl uppercase">{nome}</p>}
        <p className="mt-4 max-w-[28ch] text-sm leading-relaxed">
          {s.esito === "disattivo"
            ? "Luka l'ha tolto dai PR: niente omaggi né sconto."
            : "QR vecchio o non suo: niente omaggi né sconto. Il PR riapra l'app col link nuovo."}
        </p>
        <p className="mt-8 font-tech text-[10px] uppercase tracking-[0.25em] opacity-60">tocca per continuare</p>
      </button>
    );
  }

  const dTot = s.drink_tot ?? 1;
  const dUsati = s.drink_usati ?? 0;
  const sTot = s.shot_tot ?? 0;
  const sUsati = s.shot_usati ?? 0;
  const premio = dTot > 1;
  const regali = s.regali ?? 0;
  const scontiMax = s.sconti_max ?? SCONTI_MAX;
  const sconti = s.sconti ?? 0;
  const finiti = sconti >= scontiMax;
  const ogniPagati = s.ogni_pagati ?? OGNI_PAGATI;
  const pagati = s.pagati ?? 0;
  const versoRegalo = `${pagati % ogniPagati}/${ogniPagati} verso il regalo`;
  const drinkSerata = dUsati < dTot;

  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-y-auto bg-black px-5 pb-6 pt-6">
      <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-[#ff6b6b]">pr papi-on</p>
      <p className="mt-1 font-display text-5xl uppercase leading-none text-white">{nome}</p>
      <p className="mt-2 text-[12px] text-brand-gray">
        {s.entrato_at ? `dentro dalle ${ora(s.entrato_at)}` : "non è passato dalla cassa"} · {s.presenze ?? 0} serate
      </p>
      {premio && (
        <p className="mt-3 inline-block self-start bg-white px-3 py-1.5 font-display text-lg uppercase text-black">
          premio dei {OGNI_EXTRA}: 2 drink + 2 shot
        </p>
      )}
      {regali > 0 && (
        <p className="mt-3 inline-block self-start bg-amber-300 px-3 py-1.5 font-display text-lg uppercase text-black">
          🎁 {regali === 1 ? "1 drink in regalo" : `${regali} drink in regalo`} · {ogniPagati} pagati
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2.5">
        <Tasto
          attivo={drinkSerata || regali > 0}
          caricando={invio === "drink"}
          onClick={() => onUsa("drink")}
          titolo={
            drinkSerata
              ? `Drink omaggio 🍸${dTot > 1 ? ` ${dUsati + 1}/${dTot}` : ""}`
              : regali > 0
                ? "Drink in regalo 🎁"
                : "Drink omaggio 🍸"
          }
          sotto={
            drinkSerata
              ? (dTot > 1 ? `stasera ne ha ${dTot}, presi ${dUsati}` : "uno a sera, gratis") +
                (regali > 0 ? ` · poi ${regali} in regalo` : "")
              : regali > 0
                ? `quello della serata l'ha preso · ${regali === 1 ? "1 in regalo" : `${regali} in regalo`} (ogni ${ogniPagati} pagati)`
                : `già ${dTot > 1 ? "dati tutti e due" : "dato"} · ${s.drink_ultimo ? ora(s.drink_ultimo) : "—"}`
          }
          stile="rosso"
        />
        {sTot > 0 && (
          <Tasto
            attivo={sUsati < sTot}
            caricando={invio === "shot"}
            onClick={() => onUsa("shot")}
            titolo={`Shot omaggio 🥃${sTot > 1 ? ` ${sUsati + 1 > sTot ? sTot : sUsati + 1}/${sTot}` : ""}`}
            sotto={
              sUsati < sTot
                ? sTot > 1
                  ? `stasera ne ha ${sTot}, presi ${sUsati}`
                  : "stasera è la sua 5ª serata"
                : `già ${sTot > 1 ? "dati tutti e due" : "dato"} · ${s.shot_ultimo ? ora(s.shot_ultimo) : "—"}`
            }
            stile="rosso"
          />
        )}
        <Tasto
          attivo
          caricando={invio === "sconto"}
          onClick={() => onUsa("sconto")}
          titolo={finiti ? "Drink pagato" : `Sconto ${SCONTO_EURO} € · ${sconti + 1}/${scontiMax}`}
          sotto={
            finiti
              ? `sconti finiti stasera (${scontiMax}/${scontiMax}): prezzo pieno, ma segnalo · ${versoRegalo}`
              : `sul drink che paga (da ${SCONTO_DA} € in su) · ${versoRegalo}`
          }
          stile="bianco"
        />
      </div>

      <button
        onClick={onChiudi}
        className="mt-auto pt-6 font-tech text-[11px] uppercase tracking-[0.2em] text-brand-gray"
      >
        annulla · non segnare niente
      </button>
    </div>
  );
}

function Tasto({
  attivo,
  caricando,
  onClick,
  titolo,
  sotto,
  stile,
}: {
  attivo: boolean;
  caricando: boolean;
  onClick: () => void;
  titolo: string;
  sotto: string;
  stile: "rosso" | "bianco";
}) {
  const colori = !attivo
    ? "border border-white/10 text-white/35"
    : stile === "rosso"
      ? "bg-[#E90A11] text-white"
      : "bg-white text-black";
  return (
    <button
      disabled={!attivo || caricando}
      onClick={onClick}
      className={`w-full px-5 py-4 text-left disabled:cursor-not-allowed ${colori} ${caricando ? "opacity-60" : ""}`}
    >
      <span className="block font-display text-3xl uppercase leading-none">{caricando ? "segno…" : titolo}</span>
      <span className="mt-1.5 block text-[12px] opacity-80">{sotto}</span>
    </button>
  );
}

/** Dopo il tocco: cosa fare, a tutto schermo. */
function Esito({ f, onChiudi }: { f: Fatto; onChiudi: () => void }) {
  let sfondo = "bg-emerald-500 text-black";
  let titolo = "";
  let sotto = "";

  const regaloNuovo = f.regalo
    ? ` 🎁 Con questo fa ${f.pagati ?? OGNI_PAGATI} drink pagati: ha un drink in regalo (tasto DRINK OMAGGIO).`
    : "";

  if (f.cosa === "sconto" && f.esito === "gia") {
    sfondo = "bg-sky-400 text-black";
    titolo = "Già segnato";
    sotto = "Segnato un attimo fa: è lo stesso drink. Lo sconto si toglie una volta sola.";
  } else if (f.cosa === "sconto" && f.esito === "ok") {
    sfondo = "bg-sky-400 text-black";
    titolo = `−${SCONTO_EURO} €`;
    sotto =
      `Fai lo scontrino con ${SCONTO_EURO} € in meno.` +
      (f.sconti ? ` Sconti stasera: ${f.sconti} di ${SCONTI_MAX}.` : "") +
      regaloNuovo;
  } else if (f.cosa === "sconto" && f.esito === "pieno") {
    sfondo = "bg-white text-black";
    titolo = "Prezzo pieno";
    sotto = `Sconti finiti stasera (${SCONTI_MAX} di ${SCONTI_MAX}): niente sconto. Il drink è segnato e conta per il regalo.${regaloNuovo}`;
  } else if (f.esito === "ok") {
    titolo = f.cosa === "drink" ? (f.regalo ? "Dai il drink 🎁" : "Dai il drink 🍸") : "Dai lo shot 🥃";
    sotto =
      (f.regalo ? `Drink in regalo (ogni ${OGNI_PAGATI} pagati): non si batte.` : "Omaggio: non si batte.") +
      (f.rimasti ? ` Ne ha ancora ${f.rimasti === 1 ? "uno" : f.rimasti}.` : "");
  } else if (f.esito === "gia") {
    sfondo = "bg-amber-400 text-black";
    titolo = f.cosa === "drink" ? "Drink già dato" : "Shot già dato";
    sotto = f.quando
      ? `L'ultimo alle ${ora(f.quando)}. Se ne vuole un altro, lo paga.`
      : "";
  } else if (f.esito === "niente_shot") {
    sfondo = "bg-amber-400 text-black";
    titolo = "Niente shot";
    sotto = "Stasera non ha la tessera piena.";
  } else if (f.esito === "rete") {
    sfondo = "bg-neutral-700 text-white";
    titolo = "Nessuna risposta";
    sotto = "Niente campo: non è segnato. Riprova.";
  } else {
    sfondo = "bg-brand-red text-white";
    titolo = "Non segnato";
    sotto = f.esito === "disattivo" ? "PR non attivo." : f.esito === "sconosciuto" ? "QR non valido." : "Riprova o chiama Luka.";
  }

  return (
    <button
      onClick={onChiudi}
      className={`absolute inset-0 z-30 flex w-full flex-col items-center justify-center px-6 text-center ${sfondo}`}
    >
      <p className="font-display text-6xl uppercase leading-none">{titolo}</p>
      {f.nome && <p className="mt-4 font-display text-2xl uppercase">{f.nome}</p>}
      {sotto && <p className="mt-3 max-w-[28ch] text-sm leading-relaxed">{sotto}</p>}
      <p className="mt-8 font-tech text-[10px] uppercase tracking-[0.25em] opacity-60">tocca per continuare</p>
    </button>
  );
}
