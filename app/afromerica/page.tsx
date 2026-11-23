"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizzaNumero } from "@/lib/whatsapp";
import {
  ERRORI_ISCRIZIONE,
  INDIRIZZO_PAPION,
  LOCANDINA_AFRO,
  SLUG_AFRO,
  allOra,
  oraEN,
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

/** Dove il telefono si ricorda che si è già prenotata. */
const CHIAVE_MIA = "afromerica_mio_token";

/**
 * Gli errori in due lingue: in sala ci sono anche americani (Luka, 23/11).
 * Niente età da nessuna parte (Luka: "non scrivere niente dell'età"):
 * il menu degli anni si ferma da solo a quelli ammessi.
 */
const EN: Record<string, string> = {
  chiusa: "Reservations are closed.",
  sconosciuta: "This list doesn't exist anymore.",
  privacy: "To reserve you need to accept the privacy notice below.",
  nome_sbagliato: "Check name and surname: letters only, as on your ID.",
  numero_sbagliato: "The WhatsApp number doesn't work. Write it in full with the country code (e.g. +1…).",
  data_sbagliata: "Check your year of birth.",
  troppo_giovane: "Check your year of birth.",
  gia_registrata: "You're already reserved with another number: one reservation each.",
  numero_usato: "This number has already been used by someone else.",
  troppe: "Too many reservations from this network. Try again in an hour or from another connection.",
};
const ERRORI: Record<string, string> = Object.fromEntries(
  Object.entries({ ...ERRORI_ISCRIZIONE, troppo_giovane: "Controlla l'anno di nascita." }).map(([k, it]) => [
    k,
    EN[k] ? `${EN[k]} · ${it}` : it,
  ]),
);

/**
 * unpercento.it/afromerica — LADIES FREE · DONNA OMAGGIO ad AFRO-MERICA,
 * venerdì 27 novembre (script 68). Copia di /slings: il QR è l'ingresso
 * omaggio, lo scansiona la cassa entro l'1. Le prime 100 sono approvate
 * da sole, poi lista d'attesa. Testi in inglese, l'ingresso anche in italiano.
 */
export default function AfroPage() {
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [letto, setLetto] = useState(false);
  const [mio, setMio] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [anno, setAnno] = useState("");
  const [telefono, setTelefono] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [promo, setPromo] = useState(false);
  const [trappola, setTrappola] = useState("");
  const [informativa, setInformativa] = useState(false);

  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .rpc("omaggio_info", { p_slug: SLUG_AFRO })
      .then(({ data }) => {
        setInfo((data?.[0] as Info) ?? null);
        setLetto(true);
        let salvato: string | null = null;
        try {
          salvato = localStorage.getItem(CHIAVE_MIA);
        } catch {
          // niente memoria (navigazione privata): pazienza
        }
        if (!salvato) return;
        createClient()
          .rpc("omaggio_mia", { p_token: salvato })
          .then(({ data: mia, error }) => {
            if (error) return;
            if (mia?.[0]) setMio(salvato);
            else {
              try {
                localStorage.removeItem(CHIAVE_MIA);
              } catch {
                // pazienza
              }
            }
          });
      });
  }, []);

  // Gli anni nel menu: dalla più giovane ammessa in giù
  const anni = useMemo(() => {
    const ultimo = info ? new Date(info.starts_at).getFullYear() - info.eta_min : 2010;
    return Array.from({ length: ultimo - 1960 + 1 }, (_, i) => ultimo - i);
  }, [info]);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    if (trappola) {
      setErrore("Something went wrong. Reload the page and try again. · Ricarica la pagina e riprova.");
      return;
    }
    if (!nome.trim() || !cognome.trim()) return setErrore("Write name and surname. · Scrivi nome e cognome.");
    if (!anno) return setErrore("Pick your year of birth. · Scegli il tuo anno di nascita.");
    if (!normalizzaNumero(telefono)) return setErrore(ERRORI.numero_sbagliato);
    if (!privacy) return setErrore(ERRORI.privacy);

    // Solo l'anno, come le altre liste: il documento lo controllano in porta.
    const nascita = `${anno}-01-01`;

    setInvio(true);
    const { data, error } = await createClient().rpc("omaggio_iscrivi", {
      p_slug: SLUG_AFRO,
      p_nome: nome,
      p_cognome: cognome,
      p_nascita: nascita,
      p_telefono: telefono,
      p_instagram: null,
      p_promo: promo,
      p_privacy: privacy,
    });
    setInvio(false);

    if (error) {
      setErrore("The site isn't responding. Check your connection and try again. · Il sito non risponde, riprova.");
      return;
    }

    const r = data?.[0] as { esito: string; token: string | null } | undefined;
    if (r?.token && (r.esito === "ok" || r.esito === "gia_registrata")) {
      try {
        localStorage.setItem(CHIAVE_MIA, r.token);
      } catch {
        // la pagina personale funziona lo stesso: il link è l'indirizzo
      }
      router.push(`/${SLUG_AFRO}/${r.token}`);
      return;
    }
    setErrore(ERRORI[r?.esito ?? ""] ?? "It didn't work. Try again in a moment. · Non è andata, riprova fra poco.");
  }

  const aperta = info?.aperta ?? false;
  const ora = info ? oraRoma(info.valido_fino) : "01:00";

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-16 pt-4">
      {/* La locandina ufficiale (CINEMATIC): è lei che vende */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOCANDINA_AFRO}
        alt="AFRO-MERICA first night — Friday 27 November at PAPI-ON, American hip hop × Afrobeats, DJ SAMB X DJ KING"
        width={1080}
        height={1920}
        className="block h-auto w-full border border-white/10"
      />

      <section className="mt-7 text-center">
        <p className="font-tech text-[10px] uppercase tracking-[0.35em] text-[#e0b44a]">
          friday 27 november · papi-on
        </p>
        <h1
          className="mt-2 font-display text-[3.4rem] uppercase leading-[0.9] text-white"
          style={{ filter: "drop-shadow(0 0 16px rgba(224,180,74,0.45))" }}
        >
          Ladies
          <br />
          free
        </h1>
        <p className="mt-2 font-display text-2xl uppercase leading-none text-[#e0b44a]">Donna omaggio</p>
        <p className="mt-4 text-sm text-white/85">
          The <strong className="text-white">first 100 girls</strong> who reserve here get in free: get your QR
          scanned at the box office <strong className="text-white">before {oraEN(ora)}</strong>.
        </p>
        <p className="mt-2 text-sm text-white/65">
          Le <strong className="text-white/90">prime 100 ragazze</strong> che prenotano qui entrano gratis: fai
          scansionare il QR in cassa <strong className="text-white/90">{allOra("entro", ora)}</strong>.
        </p>
        <p className="mt-3 text-[13px] text-white/55">
          American hip hop × Afrobeats · DJ SAMB X DJ KING · doors 11:30 PM
        </p>
      </section>

      <ul className="mt-6 grid grid-cols-2 gap-2">
        {[
          ["first 100", "then waiting list · poi lista d'attesa"],
          [`before ${oraEN(ora)}`, `${allOra("entro", ora)} · after that you pay`],
          ["ladies only", "guys €10 before 1 AM, €15 after"],
          ["real ID", "in hand, not a photo · documento vero"],
        ].map(([titolo, sotto]) => (
          <li key={titolo} className="border border-white/12 bg-white/[0.03] px-3 py-3">
            <p className="font-display text-lg uppercase leading-none text-white">{titolo}</p>
            <p className="mt-1.5 text-[11px] leading-snug text-white/60">{sotto}</p>
          </li>
        ))}
      </ul>

      {mio && (
        <Link
          href={`/${SLUG_AFRO}/${mio}`}
          className="mt-6 flex items-center justify-between border border-emerald-400/50 bg-emerald-400/10 px-4 py-4"
        >
          <span>
            <span className="block font-tech text-[10px] uppercase tracking-[0.2em] text-emerald-300">
              already reserved · sei già prenotata
            </span>
            <span className="mt-1 block text-sm font-semibold text-white">See your QR · vedi il tuo QR</span>
          </span>
          <span aria-hidden className="text-xl text-emerald-300">→</span>
        </Link>
      )}

      {!letto ? (
        <div className="mt-10 text-center font-tech text-[11px] uppercase tracking-[0.3em] text-white/40 animate-pulse">
          one moment…
        </div>
      ) : !info ? (
        <div className="mt-8 border border-white/15 px-4 py-5 text-center text-sm text-white/70">
          Reservations aren&apos;t open yet. Try again later. · Le prenotazioni non sono ancora aperte.
        </div>
      ) : !aperta ? (
        <div className="mt-8 border border-white/15 px-4 py-6 text-center">
          <p className="font-display text-2xl uppercase text-white">Reservations closed</p>
          <p className="mt-2 text-[13px] leading-relaxed text-white/65">
            Free entry reservations are over: see you on Friday at AFRO-MERICA. · Prenotazioni chiuse: ti aspettiamo
            venerdì.
          </p>
        </div>
      ) : (
        <form onSubmit={invia} className="mt-8 border border-white/12 bg-white/[0.03] px-4 py-5" noValidate>
          <p className="font-display text-2xl uppercase leading-none text-white">
            {info.esauriti ? "Spots gone · waiting list" : "Reserve · prenota"}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-white/60">
            {info.esauriti
              ? "All free spots are taken. Leave your details: if one frees up it shows on your page. · Posti finiti: lascia i tuoi dati per la lista d'attesa."
              : "Write your details as on your ID: we check them at the door. · Scrivi i dati come sul documento."}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Campo etichetta="name · nome">
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoComplete="given-name"
                autoCapitalize="words"
                maxLength={40}
                className={INPUT}
              />
            </Campo>
            <Campo etichetta="surname · cognome">
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

          <Campo etichetta="year of birth · anno di nascita" classe="mt-3">
            <select value={anno} onChange={(e) => setAnno(e.target.value)} className={INPUT} aria-label="year of birth">
              <option value="">pick the year · scegli</option>
              {anni.map((a) => (
                <option key={a} value={String(a)}>{a}</option>
              ))}
            </select>
          </Campo>

          <Campo etichetta="whatsapp number · numero" classe="mt-3" nota="to reach you if needed · per scriverti se serve">
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="347 123 4567 · +1 …"
              className={INPUT}
            />
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
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#e0b44a]"
            />
            <span className="text-[12px] leading-relaxed text-white/80">
              I&apos;ve read the{" "}
              <button
                type="button"
                onClick={() => setInformativa((v) => !v)}
                className="underline decoration-white/40 underline-offset-2"
              >
                privacy notice · informativa
              </button>{" "}
              and I agree that my data is used to manage my free entry to this night, also via WhatsApp. · Accetto che i
              miei dati servano a gestire il mio ingresso omaggio a questa serata, anche su WhatsApp.
            </span>
          </label>

          <label className="mt-3 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={promo}
              onChange={(e) => setPromo(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#e0b44a]"
            />
            <span className="text-[12px] leading-relaxed text-white/80">
              Tell me on WhatsApp about the next PAPI-ON nights. · Avvisatemi delle prossime serate.{" "}
              <span className="text-white/45">(optional · facoltativo)</span>
            </span>
          </label>

          {informativa && (
            <div className="mt-3 border-l-2 border-[#e0b44a] bg-white/[0.03] px-3 py-3 text-[11px] leading-relaxed text-white/65">
              Data controller · Titolare: <strong className="text-white">QFB SRL</strong> (PAPI-ON), P.IVA 01920690938.
              Name, surname, year of birth and WhatsApp are used to manage your free entry to AFRO-MERICA on 27 November
              and to contact you about this night. If you tick «tell me», also about the next PAPI-ON nights, until you
              ask us to stop. We don&apos;t share them with anyone. You can ask for deletion any time at
              papionthebeach22@gmail.com. · Nome, cognome, anno di nascita e WhatsApp servono a gestire il tuo ingresso
              omaggio ad AFRO-MERICA del 27 novembre e a scriverti per questa serata; se spunti «avvisatemi», anche per le
              prossime serate del PAPI-ON. Non li diamo a nessuno. Cancellazione quando vuoi:
              papionthebeach22@gmail.com.{" "}
              <Link href="/privacy" className="underline underline-offset-2">
                Privacy
              </Link>
              .
            </div>
          )}

          {errore && (
            <p role="alert" className="mt-4 border border-[#e0b44a]/60 bg-[#e0b44a]/10 px-3 py-2.5 text-[13px] text-white">
              {errore}
            </p>
          )}

          <button
            type="submit"
            disabled={invio}
            className="mt-5 w-full bg-[#e0b44a] px-4 py-4 font-display text-xl uppercase tracking-wide text-black transition-opacity disabled:opacity-60"
            style={{ boxShadow: "0 0 32px rgba(224,180,74,0.35)" }}
          >
            {invio ? "one moment…" : info.esauriti ? "Waiting list · lista d'attesa" : "Reserve my free entry · prenota"}
          </button>
        </form>
      )}

      <footer className="mt-10 text-center">
        <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-white/50">friday 27 november · papi-on</p>
        <p className="mt-1 text-[11px] text-white/40">{INDIRIZZO_PAPION}</p>
        <p className="mt-4 text-[10px] text-white/25">reservations by unpercento.it</p>
      </footer>
    </main>
  );
}

const INPUT =
  "w-full appearance-none rounded-none border border-white/15 bg-black/60 px-3 py-3 text-[16px] text-white placeholder:text-white/30 outline-none focus:border-[#e0b44a]";

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
