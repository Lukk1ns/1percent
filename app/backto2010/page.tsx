"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizzaNumero } from "@/lib/whatsapp";
import {
  ERRORI_ISCRIZIONE,
  INDIRIZZO_PAPION,
  LOCANDINA_2010,
  SLUG_BACK_TO_2010,
  allOra,
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

/** Dove il telefono si ricorda che si è già registrato. */
const CHIAVE_MIA = "backto2010_mio_token";

/** Quelli di MALDITA erano scritti per le ragazze dai 16 anni. */
const ERRORI: Record<string, string> = {
  ...ERRORI_ISCRIZIONE,
  privacy: "Per registrarti devi accettare l'informativa qui sotto.",
  troppo_giovane: "Lo shot omaggio è dai 18 anni in su.",
  gia_registrata: "Hai già una registrazione con un altro numero: ne vale una a testa.",
  troppe: "Troppe registrazioni dalla stessa rete. Riprova fra un'ora o da un'altra connessione.",
};

/**
 * unpercento.it/backto2010 — SHOT OMAGGIO a BACK TO 2010 (script 51).
 *
 * Come /maldita: in alto la serata, le quattro regole, il modulo. Dopo
 * l'invio si finisce sulla propria pagina col QR.
 */
export default function BackTo2010Page() {
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [letto, setLetto] = useState(false);
  const [mio, setMio] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [anno, setAnno] = useState("");
  const [telefono, setTelefono] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [trappola, setTrappola] = useState("");
  const [informativa, setInformativa] = useState(false);

  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .rpc("omaggio_info", { p_slug: SLUG_BACK_TO_2010 })
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

  // Gli anni nel menu: dal più giovane ammesso in giù
  const anni = useMemo(() => {
    const ultimo = info ? new Date(info.starts_at).getFullYear() - info.eta_min : 2008;
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
    if (!anno) return setErrore("Scegli il tuo anno di nascita.");
    if (!normalizzaNumero(telefono)) return setErrore(ERRORI.numero_sbagliato);
    if (!privacy) return setErrore(ERRORI.privacy);

    // Solo l'anno, come MALDITA: il 1° gennaio fa passare chi è nato
    // entro il 2008, cioè i 18 anni fatti sull'anno. Il resto in porta.
    const nascita = `${anno}-01-01`;

    setInvio(true);
    const { data, error } = await createClient().rpc("omaggio_iscrivi", {
      p_slug: SLUG_BACK_TO_2010,
      p_nome: nome,
      p_cognome: cognome,
      p_nascita: nascita,
      p_telefono: telefono,
      p_instagram: null,
      p_promo: false,
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
      router.push(`/${SLUG_BACK_TO_2010}/${r.token}`);
      return;
    }
    setErrore(ERRORI[r?.esito ?? ""] ?? "Non è andata. Riprova fra poco.");
  }

  const aperta = info?.aperta ?? false;
  const ora = info ? oraRoma(info.valido_fino) : "01:00";

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-16 pt-4">
      {/* La locandina: è lei che vende */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOCANDINA_2010}
        alt="PRE HALLOWEEN PARTY · BACK TO 2010, reggaeton & hip hop — venerdì 30 ottobre al PAPI-ON con Deejlord e DJ Darian Cuban Flow, free entry per tutti fino all'1"
        width={1080}
        height={1350}
        className="block h-auto w-full border border-white/10"
      />

      <section className="mt-7 text-center">
        <p className="font-tech text-[10px] uppercase tracking-[0.35em] text-[#ff8a80]">
          venerdì 30 ottobre · papi-on
        </p>
        <h1
          className="mt-2 font-display text-[3.4rem] uppercase leading-[0.9] text-white"
          // drop-shadow e non text-shadow: con le righe così strette la seconda
          // riga copriva il bagliore della prima, che usciva tagliato
          style={{ filter: "drop-shadow(0 0 16px rgba(255,58,46,0.55))" }}
        >
          Shot
          <br />
          omaggio
        </h1>
        <p className="mt-3 text-sm text-white/80">
          Ingresso <strong className="text-white">gratis per tutti {allOra("fino", ora)}</strong>.
          Registrati qui: vai dritto al bar e fai scansionare il tuo QR{" "}
          <strong className="text-white">{allOra("entro", ora)}</strong>, lo shot te lo offriamo noi.
        </p>
        <p className="mt-2 text-[13px] text-white/60">
          Vieni in costume: entri gratis anche {allOra("dopo", ora)}.
        </p>
      </section>

      {/* Le regole: corte, si leggono in tre secondi */}
      <ul className="mt-6 grid grid-cols-2 gap-2">
        {[
          ["per tutti", `dai ${info?.eta_min ?? 18} anni in su`],
          [allOra("entro", ora), "il QR si scansiona al bar"],
          ["uno a testa", "in cassa non serve"],
          ["documento vero", "in mano, non la foto"],
        ].map(([titolo, sotto]) => (
          <li key={titolo} className="border border-white/12 bg-white/[0.03] px-3 py-3">
            <p className="font-display text-lg uppercase leading-none text-white">{titolo}</p>
            <p className="mt-1.5 text-[11px] leading-snug text-white/60">{sotto}</p>
          </li>
        ))}
      </ul>

      {mio && (
        <Link
          href={`/${SLUG_BACK_TO_2010}/${mio}`}
          className="mt-6 flex items-center justify-between border border-emerald-400/50 bg-emerald-400/10 px-4 py-4"
        >
          <span>
            <span className="block font-tech text-[10px] uppercase tracking-[0.2em] text-emerald-300">
              sei già registrato
            </span>
            <span className="mt-1 block text-sm font-semibold text-white">Vedi il tuo QR</span>
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
          Le registrazioni non sono ancora aperte. Riprova più tardi.
        </div>
      ) : !aperta ? (
        <div className="mt-8 border border-white/15 px-4 py-6 text-center">
          <p className="font-display text-2xl uppercase text-white">Registrazioni chiuse</p>
          <p className="mt-2 text-[13px] leading-relaxed text-white/65">
            Le registrazioni per lo shot sono finite. L&apos;ingresso resta gratis per tutti{" "}
            {allOra("fino", ora)}: ti aspettiamo venerdì.
          </p>
        </div>
      ) : (
        <form onSubmit={invia} className="mt-8 border border-white/12 bg-white/[0.03] px-4 py-5" noValidate>
          <p className="font-display text-2xl uppercase leading-none text-white">
            {info.esauriti ? "Shot finiti · lista d'attesa" : "Registrati"}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-white/60">
            {info.esauriti
              ? "Gli shot omaggio sono tutti assegnati. Lascia i tuoi dati: se se ne libera uno compare sulla tua pagina."
              : "Scrivi i dati come sul documento: all'ingresso li controlliamo."}
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

          <Campo etichetta="anno di nascita" classe="mt-3">
            <select value={anno} onChange={(e) => setAnno(e.target.value)} className={INPUT} aria-label="anno di nascita">
              <option value="">scegli l&apos;anno</option>
              {anni.map((a) => (
                <option key={a} value={String(a)}>{a}</option>
              ))}
            </select>
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
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#ff3a2e]"
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
            <div className="mt-3 border-l-2 border-[#ff3a2e] bg-white/[0.03] px-3 py-3 text-[11px] leading-relaxed text-white/65">
              Titolare: <strong className="text-white">QFB SRL</strong> (PAPI-ON), P.IVA 01920690938.
              Nome, cognome, anno di nascita e WhatsApp servono solo a gestire il tuo shot omaggio a
              BACK TO 2010 del 30 ottobre e a scriverti su WhatsApp per questa serata, e li teniamo solo
              per il tempo che serve a questo. Non li diamo a nessun altro. Puoi chiederne la cancellazione
              quando vuoi scrivendo a papionthebeach22@gmail.com.{" "}
              <Link href="/privacy" className="underline underline-offset-2">
                Privacy completa
              </Link>
              .
            </div>
          )}

          {errore && (
            <p role="alert" className="mt-4 border border-[#ff3a2e]/60 bg-[#ff3a2e]/10 px-3 py-2.5 text-[13px] text-white">
              {errore}
            </p>
          )}

          <button
            type="submit"
            disabled={invio}
            className="mt-5 w-full bg-[#ff3a2e] px-4 py-4 font-display text-xl uppercase tracking-wide text-black transition-opacity disabled:opacity-60"
            style={{ boxShadow: "0 0 32px rgba(255,58,46,0.45)" }}
          >
            {invio ? "un attimo…" : info.esauriti ? "Mettimi in lista d'attesa" : "Voglio il mio shot"}
          </button>
        </form>
      )}

      <footer className="mt-10 text-center">
        <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-white/50">venerdì 30 ottobre · papi-on</p>
        <p className="mt-1 text-[11px] text-white/40">{INDIRIZZO_PAPION}</p>
        <p className="mt-4 text-[10px] text-white/25">registrazioni gestite da unpercento.it</p>
      </footer>
    </main>
  );
}

const INPUT =
  "w-full appearance-none rounded-none border border-white/15 bg-black/60 px-3 py-3 text-[16px] text-white placeholder:text-white/30 outline-none focus:border-[#ff3a2e]";

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
