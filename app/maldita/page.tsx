"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizzaNumero } from "@/lib/whatsapp";
import {
  ERRORI_ISCRIZIONE,
  INDIRIZZO_PAPION,
  LOCANDINA_WEB,
  MESI,
  SLUG_MALDITA,
  giornoOraRoma,
  oraRoma,
} from "@/lib/omaggio";

type Info = {
  titolo: string;
  starts_at: string;
  aperta: boolean;
  chiude_at: string;
  esauriti: boolean;
  eta_min: number;
  valido_fino: string;
};

/** Dove il telefono si ricorda che lei ha già prenotato. */
const CHIAVE_MIA = "maldita_mio_token";

/**
 * unpercento.it/maldita — DONNA OMAGGIO all'apertura del nuovo PAPI-ON.
 *
 * Una pagina sola, pensata per il telefono: la locandina, le quattro
 * regole, il modulo. Dopo l'invio si finisce sulla propria pagina, che
 * dice "in attesa" e mostra il QR quando la prenotazione è confermata.
 */
export default function MalditaPage() {
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [letto, setLetto] = useState(false);
  const [mio, setMio] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [giorno, setGiorno] = useState("");
  const [mese, setMese] = useState("");
  const [anno, setAnno] = useState("");
  const [telefono, setTelefono] = useState("");
  const [instagram, setInstagram] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [promo, setPromo] = useState(false);
  const [trappola, setTrappola] = useState("");
  const [informativa, setInformativa] = useState(false);

  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .rpc("omaggio_info", { p_slug: SLUG_MALDITA })
      .then(({ data }) => {
        setInfo((data?.[0] as Info) ?? null);
        setLetto(true);
        try {
          setMio(localStorage.getItem(CHIAVE_MIA));
        } catch {
          // niente memoria (navigazione privata): pazienza
        }
      });
  }, []);

  // Gli anni nel menu: dal più giovane ammesso in giù
  const anni = useMemo(() => {
    const ultimo = info ? new Date(info.starts_at).getFullYear() - info.eta_min : 2010;
    return Array.from({ length: ultimo - 1960 + 1 }, (_, i) => ultimo - i);
  }, [info]);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);

    // Un programma che compila tutti i campi riempie anche questo
    if (trappola) {
      setErrore("Qualcosa non va. Ricarica la pagina e riprova.");
      return;
    }
    if (!nome.trim() || !cognome.trim()) return setErrore("Scrivi nome e cognome.");
    if (!giorno || !mese || !anno) return setErrore("Scegli la tua data di nascita.");
    if (!normalizzaNumero(telefono)) return setErrore(ERRORI_ISCRIZIONE.numero_sbagliato);
    if (!privacy) return setErrore(ERRORI_ISCRIZIONE.privacy);

    const nascita = `${anno}-${mese.padStart(2, "0")}-${giorno.padStart(2, "0")}`;
    // 31 febbraio e simili: la data deve esistere
    const prova = new Date(`${nascita}T12:00:00`);
    if (prova.getDate() !== Number(giorno)) return setErrore("Questa data non esiste: controllala.");

    setInvio(true);
    const { data, error } = await createClient().rpc("omaggio_iscrivi", {
      p_slug: SLUG_MALDITA,
      p_nome: nome,
      p_cognome: cognome,
      p_nascita: nascita,
      p_telefono: telefono,
      p_instagram: instagram || null,
      p_promo: promo,
      p_privacy: privacy,
    });
    setInvio(false);

    if (error) {
      setErrore("Il sito non risponde. Controlla la connessione e riprova.");
      return;
    }

    const r = data?.[0] as { esito: string; token: string | null } | undefined;
    if (r?.token && (r.esito === "ok" || r.esito === "gia_registrata")) {
      try {
        localStorage.setItem(CHIAVE_MIA, r.token);
      } catch {
        // la pagina personale funziona lo stesso: il link è l'indirizzo
      }
      router.push(`/${SLUG_MALDITA}/${r.token}`);
      return;
    }
    setErrore(ERRORI_ISCRIZIONE[r?.esito ?? ""] ?? "Non è andata. Riprova fra poco.");
  }

  const aperta = info?.aperta ?? false;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-16 pt-4">
      {/* La locandina: è lei che vende */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOCANDINA_WEB}
        alt="MALDITA · Official Opening — sabato 17 ottobre al PAPI-ON, special guest Armando Castillo"
        width={1080}
        height={1920}
        className="block h-auto w-full border border-white/10"
      />

      <section className="mt-7 text-center">
        <p className="font-tech text-[10px] uppercase tracking-[0.35em] text-[#ff5a5f]">
          sabato 17 ottobre · nuovo papi-on
        </p>
        <h1
          className="mt-2 font-display text-[3.4rem] uppercase leading-[0.9] text-white"
          style={{ textShadow: "0 0 28px rgba(224,24,31,0.75)" }}
        >
          Donna
          <br />
          omaggio
        </h1>
        <p className="mt-3 text-sm text-white/80">
          Entri gratis se arrivi <strong className="text-white">entro le {info ? oraRoma(info.valido_fino) : "00:30"}</strong>.
          Prenoti qui e, quando ti confermiamo, il tuo QR compare sulla tua pagina.
        </p>
      </section>

      {/* Le regole: corte, si leggono in tre secondi */}
      <ul className="mt-6 grid grid-cols-2 gap-2">
        {[
          ["solo ragazze", `dai ${info?.eta_min ?? 16} anni in su`],
          [`entro le ${info ? oraRoma(info.valido_fino) : "00:30"}`, "dopo si paga, senza eccezioni"],
          ["documento vero", "in mano, non la foto"],
          ["posti limitati", "conferma sulla tua pagina"],
        ].map(([titolo, sotto]) => (
          <li key={titolo} className="border border-white/12 bg-white/[0.03] px-3 py-3">
            <p className="font-display text-lg uppercase leading-none text-white">{titolo}</p>
            <p className="mt-1.5 text-[11px] leading-snug text-white/60">{sotto}</p>
          </li>
        ))}
      </ul>

      {mio && (
        <Link
          href={`/${SLUG_MALDITA}/${mio}`}
          className="mt-6 flex items-center justify-between border border-emerald-400/50 bg-emerald-400/10 px-4 py-4"
        >
          <span>
            <span className="block font-tech text-[10px] uppercase tracking-[0.2em] text-emerald-300">
              hai già prenotato
            </span>
            <span className="mt-1 block text-sm font-semibold text-white">Vedi il tuo ingresso</span>
          </span>
          <span aria-hidden className="text-xl text-emerald-300">→</span>
        </Link>
      )}

      {!letto ? (
        <div className="mt-10 text-center font-tech text-[11px] uppercase tracking-[0.3em] text-white/40 animate-pulse">
          un attimo…
        </div>
      ) : !info ? (
        <div className="mt-8 border border-white/15 px-4 py-5 text-center text-sm text-white/70">
          Le prenotazioni non sono ancora aperte. Riprova più tardi.
        </div>
      ) : !aperta ? (
        <div className="mt-8 border border-white/15 px-4 py-6 text-center">
          <p className="font-display text-2xl uppercase text-white">Prenotazioni chiuse</p>
          <p className="mt-2 text-[13px] leading-relaxed text-white/65">
            Le prenotazioni per l&apos;omaggio sono finite. Ti aspettiamo lo stesso sabato
            dalle 23:00.
          </p>
        </div>
      ) : (
        <form onSubmit={invia} className="mt-8 border border-white/12 bg-white/[0.03] px-4 py-5" noValidate>
          <p className="font-display text-2xl uppercase leading-none text-white">
            {info.esauriti ? "Posti finiti · lista d'attesa" : "Prenota il tuo omaggio"}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-white/60">
            {info.esauriti
              ? "I posti omaggio sono tutti assegnati. Lascia i tuoi dati: se se ne libera uno ti scriviamo noi."
              : `Scrivi i dati come sul documento: all'ingresso li controlliamo. Hai tempo fino a ${giornoOraRoma(info.chiude_at)}.`}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Campo etichetta="nome">
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoComplete="given-name"
                autoCapitalize="words"
                maxLength={40}
                className={INPUT}
              />
            </Campo>
            <Campo etichetta="cognome">
              <input
                value={cognome}
                onChange={(e) => setCognome(e.target.value)}
                autoComplete="family-name"
                autoCapitalize="words"
                maxLength={40}
                className={INPUT}
              />
            </Campo>
          </div>

          <Campo etichetta="data di nascita" classe="mt-3">
            <div className="grid grid-cols-[1fr_1.6fr_1.3fr] gap-2">
              <select value={giorno} onChange={(e) => setGiorno(e.target.value)} className={INPUT} aria-label="giorno">
                <option value="">giorno</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((g) => (
                  <option key={g} value={String(g)}>{g}</option>
                ))}
              </select>
              <select value={mese} onChange={(e) => setMese(e.target.value)} className={INPUT} aria-label="mese">
                <option value="">mese</option>
                {MESI.map((m, i) => (
                  <option key={m} value={String(i + 1)}>{m}</option>
                ))}
              </select>
              <select value={anno} onChange={(e) => setAnno(e.target.value)} className={INPUT} aria-label="anno">
                <option value="">anno</option>
                {anni.map((a) => (
                  <option key={a} value={String(a)}>{a}</option>
                ))}
              </select>
            </div>
          </Campo>

          <Campo etichetta="numero whatsapp" classe="mt-3" nota="per scriverti se serve">
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="347 123 4567"
              className={INPUT}
            />
          </Campo>

          <Campo etichetta="instagram · facoltativo" classe="mt-3">
            <div className="flex items-stretch">
              <span className="flex items-center border border-r-0 border-white/15 bg-white/[0.04] px-3 text-white/50">@</span>
              <input
                value={instagram}
                onChange={(e) => setInstagram(e.target.value.replace(/^@/, ""))}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="il tuo profilo"
                className={`${INPUT} min-w-0 flex-1`}
              />
            </div>
          </Campo>

          {/* Nascosto alle persone, visibile ai programmi che compilano tutto */}
          <input
            value={trappola}
            onChange={(e) => setTrappola(e.target.value)}
            name="sito"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            className="absolute -left-[9999px] h-px w-px opacity-0"
          />

          <label className="mt-5 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={privacy}
              onChange={(e) => setPrivacy(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#e0181f]"
            />
            <span className="text-[12px] leading-relaxed text-white/80">
              Ho letto l&apos;
              <button
                type="button"
                onClick={() => setInformativa((v) => !v)}
                className="underline decoration-white/40 underline-offset-2"
              >
                informativa
              </button>{" "}
              e accetto che i miei dati servano a gestire il mio ingresso a questa serata, anche
              scrivendomi su WhatsApp.
            </span>
          </label>

          {informativa && (
            <div className="mt-3 border-l-2 border-[#e0181f] bg-white/[0.03] px-3 py-3 text-[11px] leading-relaxed text-white/65">
              Titolare: <strong className="text-white">QFB SRL</strong> (PAPI-ON), P.IVA 01920690938.
              Nome, cognome, data di nascita, WhatsApp e Instagram servono solo a gestire il tuo
              ingresso omaggio a MALDITA del 17 ottobre e a scriverti su WhatsApp per questa
              serata. Se spunti la casella qui sotto, anche per avvisarti delle prossime serate del
              PAPI-ON. Non li diamo a nessun altro. Puoi chiederne la cancellazione quando vuoi
              scrivendo a papionthebeach22@gmail.com.{" "}
              <Link href="/privacy" className="underline underline-offset-2">
                Privacy completa
              </Link>
              .
            </div>
          )}

          <label className="mt-3 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={promo}
              onChange={(e) => setPromo(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#e0181f]"
            />
            <span className="text-[12px] leading-relaxed text-white/60">
              Avvisatemi su WhatsApp anche delle prossime serate del PAPI-ON. <em>(facoltativo)</em>
            </span>
          </label>

          {errore && (
            <p role="alert" className="mt-4 border border-[#e0181f]/60 bg-[#e0181f]/10 px-3 py-2.5 text-[13px] text-white">
              {errore}
            </p>
          )}

          <button
            type="submit"
            disabled={invio}
            className="mt-5 w-full bg-[#e0181f] px-4 py-4 font-display text-xl uppercase tracking-wide text-white transition-opacity disabled:opacity-60"
            style={{ boxShadow: "0 0 32px rgba(224,24,31,0.45)" }}
          >
            {invio ? "un attimo…" : info.esauriti ? "Mettimi in lista d'attesa" : "Prenota il mio omaggio"}
          </button>
        </form>
      )}

      <footer className="mt-10 text-center">
        <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-white/50">
          sabato 17 ottobre · dalle 23:00
        </p>
        <p className="mt-1 text-[11px] text-white/40">{INDIRIZZO_PAPION}</p>
        <p className="mt-4 text-[10px] text-white/25">prenotazioni gestite da unpercento.it</p>
      </footer>
    </main>
  );
}

const INPUT =
  "w-full appearance-none rounded-none border border-white/15 bg-black/60 px-3 py-3 text-[16px] text-white placeholder:text-white/30 outline-none focus:border-[#e0181f]";

function Campo({
  etichetta,
  nota,
  classe = "",
  children,
}: {
  etichetta: string;
  nota?: string;
  classe?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={classe}>
      <p className="mb-1.5 font-tech text-[10px] uppercase tracking-[0.2em] text-white/55">{etichetta}</p>
      {children}
      {nota && <p className="mt-1 text-[10px] text-white/40">{nota}</p>}
    </div>
  );
}
