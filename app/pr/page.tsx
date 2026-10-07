"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { accentoSerata, dataLunga, giornoEData } from "@/lib/eventi";
import { ProfiloStelle } from "@/components/Stelle";
import { ChiediNumero } from "@/components/ChiediNumero";

type EventoPR = {
  event_id: string;
  nome: string;
  slug: string;
  locale: string | null;
  starts_at: string;
  cover_key: string | null;
  assegnate: number;
  vendute: number;
  residue: number;
  /** false = non più agganciato a questa serata: si vedono i biglietti, non si vende (script 39) */
  puo_vendere?: boolean;
};

type Stato = {
  aperta: boolean;
  vendite_on: boolean;
  sono_pr: boolean;
  sono_admin: boolean;
  soglia: number;
};

/** Le vendite che contano per i punti: sue, valide, a pagamento. */
type Punti = {
  alias: string;
  numero: number | null;
  vendite: number;
  per_serata: Record<string, number>;
};

/**
 * L'ingresso dell'area PR.
 *
 * Non c'è nessun link che porti qui da nessuna parte del sito: finché
 * l'interruttore nel pannello è spento, entra solo l'admin per provarla.
 * I PR sono la crew già approvata: nessun account nuovo, nessun import.
 */
export default function PrPage() {
  const router = useRouter();
  const [stato, setStato] = useState<Stato | null>(null);
  // I tre di fiducia: hanno una porta in più, e non deve essere nascosta
  // (la lezione dell'area PR senza link, 24 set).
  const [sonoManager, setSonoManager] = useState(false);
  const [eventi, setEventi] = useState<EventoPR[]>([]);
  // Le stelle (30 set). Null finché 38_punti_pr.sql non è incollato:
  // la scheda semplicemente non compare.
  const [punti, setPunti] = useState<Punti | null>(null);
  const [serataId, setSerataId] = useState<string | null>(null);
  // Luka non ha punti (le sue vendite non contano): per vedere la
  // scheda come la vedono i PR apre un'anteprima con numeri di esempio.
  const [anteprima, setAnteprima] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  // Senza numero WhatsApp il PR non vende (script 41): prima lo scrive.
  const [serveNumero, setServeNumero] = useState(false);
  // Una sessione senza profilo dietro: glielo si dice e lo si fa
  // rientrare, invece di un "area riservata" muto da cui non esce.
  // `email` null = accesso anonimo rimasto orfano (iscritto da Safari,
  // poi rientrato dall'app: il profilo è andato con l'app).
  const [senzaProfilo, setSenzaProfilo] = useState<{ email: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      // La sessione salvata sul telefono: senza campo getUser() torna
      // vuoto e mandava al login chi era già dentro.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        router.replace("/login?next=/pr");
        return;
      }

      let { data: st, error: errSt } = await supabase.rpc("prevendite_stato");

      // Entrato con la mail ma il profilo è ancora sull'accesso di prima
      // (iscritto da Safari e rientrato dall'app, telefono nuovo, PR
      // aggiunto a mano): lo si riattacca qui. Prima di oggi chi entrava
      // da /login?next=/pr restava così, e da questa pagina non usciva:
      // "area riservata", con la sessione aperta e nessuna strada.
      const ok = (x: typeof st) => Boolean(x?.[0]?.sono_pr || x?.[0]?.sono_admin);
      if (!errSt && !ok(st)) {
        const { data: mio } = await supabase.rpc("my_profile");
        if (!mio || (Array.isArray(mio) && mio.length === 0)) {
          const { data: ritrovato } = user.email
            ? await supabase.rpc("link_email_account")
            : { data: false };
          if (ritrovato) ({ data: st, error: errSt } = await supabase.rpc("prevendite_stato"));
          else setSenzaProfilo({ email: user.email ?? null });
        }
      }

      // Se lo script del ruolo non è incollato la chiamata fallisce:
      // non deve portarsi dietro il resto della pagina.
      supabase
        .rpc("is_account_manager")
        .then(({ data }) => setSonoManager(Boolean(data)));

      if (errSt && !errSt.code) {
        // Un errore senza codice è la rete, non il database.
        setErrore("Niente connessione: spostati dove prende e riapri la pagina.");
        setLoading(false);
        return;
      }
      if (errSt) {
        setErrore(
          "Il modulo prevendite non è ancora installato sul database. " +
            "Va incollato supabase/09_prevendite.sql nel SQL Editor.",
        );
        setLoading(false);
        return;
      }
      const s: Stato = st?.[0] ?? {
        aperta: false,
        vendite_on: false,
        sono_pr: false,
        sono_admin: false,
        soglia: 13,
      };
      setStato(s);

      if (s.sono_pr && (s.aperta || s.sono_admin)) {
        // Un errore qui non va nascosto dietro una lista vuota: prima
        // "nessuna serata" voleva dire tanto "non ce ne sono" quanto
        // "il database si è rifiutato di rispondere".
        // I punti partono insieme alle serate, così la scheda non spunta
        // dopo spingendo giù tutto. Un loro errore non ferma la pagina.
        // Le vendite della direzione non danno punti: all'admin niente.
        // Il numero: un errore (script 41 non incollato) non blocca nessuno.
        const [evRes, ptRes, numRes] = await Promise.all([
          supabase.rpc("pr_eventi"),
          s.sono_admin ? Promise.resolve(null) : supabase.rpc("pr_punti"),
          s.sono_admin ? Promise.resolve(null) : supabase.rpc("pr_mio_numero"),
        ]);
        if (numRes && !numRes.error && !numRes.data) setServeNumero(true);
        if (evRes.error) {
          setErrore(evRes.error.message);
          setLoading(false);
          return;
        }
        const lista: EventoPR[] = evRes.data ?? [];
        setEventi(lista);
        if (ptRes && !ptRes.error && ptRes.data?.[0]) setPunti(ptRes.data[0] as Punti);
        // La serata della scheda: la più vicina non ancora finita, con
        // dodici ore di margine così durante la notte resta quella.
        const vicina = lista.find(
          (e) => new Date(e.starts_at).getTime() > Date.now() - 12 * 60 * 60 * 1000,
        );
        setSerataId(vicina?.event_id ?? null);
      }
      setLoading(false);
    })();
  }, [router]);

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="font-display text-6xl text-brand-red animate-pulse-glow">1%</div>
      </main>
    );
  }

  if (errore) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="max-w-sm text-sm leading-relaxed text-brand-gray">{errore}</p>
      </main>
    );
  }

  // Il sito non sa chi è: mail sbagliata (quasi sempre si era iscritto
  // con un'altra) o un accesso vecchio. Esce e rientra con la sua mail.
  if (!stato?.sono_pr && senzaProfilo) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 font-display text-6xl text-brand-red">%</div>
        <h1 className="mb-3 text-xl font-semibold text-white">
          {senzaProfilo.email ? "Mail sbagliata?" : "Rientra"}
        </h1>
        <p className="max-w-xs text-sm leading-relaxed text-brand-gray">
          {senzaProfilo.email ? (
            <>
              Sei entrato con <span className="break-all text-white">{senzaProfilo.email}</span>,
              ma nessun iscritto ha questa mail. Rientra con quella con cui ti sei iscritto, o con
              quella che ti ha scritto Luka.
            </>
          ) : (
            <>Su questo telefono il sito non ti riconosce più. Rientra con la tua mail: ti arriva un codice.</>
          )}
        </p>
        <button
          onClick={async () => {
            await createClient().auth.signOut();
            router.replace("/login?next=/pr");
          }}
          className="btn btn-primary mt-8"
        >
          {senzaProfilo.email ? "Rientra con un'altra mail →" : "Rientra con la mail →"}
        </button>
      </main>
    );
  }

  // Non è della crew: qui non c'è niente per lui.
  if (!stato?.sono_pr) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 font-display text-6xl text-brand-red">%</div>
        <h1 className="mb-3 text-xl font-semibold text-white">Area riservata</h1>
        <p className="max-w-xs text-sm leading-relaxed text-brand-gray">
          Questa parte è di chi lavora con noi. Se pensi di doverci entrare, parlane con Luka.
        </p>
        <Link href="/" className="mt-8 font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray hover:text-white">
          torna alla home →
        </Link>
      </main>
    );
  }

  // È della crew, ma il modulo è ancora spento.
  if (!stato.aperta && !stato.sono_admin) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 font-display text-6xl text-brand-red">%</div>
        <h1 className="mb-3 text-xl font-semibold text-white">Non ancora</h1>
        <p className="max-w-xs text-sm leading-relaxed text-brand-gray">
          Le prevendite sul sito stanno per partire. Quando si apre, te lo diciamo noi.
        </p>
      </main>
    );
  }

  if (serveNumero) return <ChiediNumero onFatto={() => setServeNumero(false)} />;

  const serataVicina = eventi.find((e) => e.event_id === serataId) ?? null;

  return (
    <main className="flex-1 px-5 py-10">
      <div className="mx-auto w-full max-w-lg">
        {/* Le stelle del PR, in cima (30 set). Solo i suoi numeri. */}
        {punti && (
          <div className="mb-6">
            <ProfiloStelle
              alias={punti.alias}
              numero={punti.numero}
              vendite={punti.vendite}
              serata={
                serataVicina
                  ? {
                      nome: serataVicina.nome,
                      startsAt: serataVicina.starts_at,
                      vendite: punti.per_serata?.[serataVicina.event_id] ?? 0,
                      accento: accentoSerata(serataVicina.event_id),
                    }
                  : null
              }
            />
          </div>
        )}

        {stato.sono_admin && (
          <div className="mb-6">
            <button
              onClick={() => setAnteprima((a) => !a)}
              className="w-full border border-dashed border-amber-300/40 px-4 py-2.5 text-left font-tech text-[10px] uppercase tracking-[0.2em] text-amber-300 transition-colors hover:border-amber-300"
            >
              {anteprima ? "chiudi l'anteprima ↑" : "★ come vede le sue stelle un pr →"}
            </button>
            {anteprima && (
              <div className="mt-2">
                <ProfiloStelle
                  alias="Esempio"
                  numero={null}
                  vendite={47}
                  serata={
                    serataVicina
                      ? {
                          nome: serataVicina.nome,
                          startsAt: serataVicina.starts_at,
                          vendite: 12,
                          accento: accentoSerata(serataVicina.event_id),
                        }
                      : null
                  }
                />
                <p className="mt-2 text-[11px] leading-relaxed text-brand-gray">
                  Numeri di esempio: 47 prevendite in tutto, 12 su questa serata. Ogni PR vede
                  solo i suoi, in cima a questa pagina.
                </p>
              </div>
            )}
          </div>
        )}

        {stato.sono_admin && (
          <div className="mb-6 border border-brand-red/40 bg-brand-red/5 px-4 py-3">
            <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-red">
              direzione
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/70">
              Vendi senza limiti, su qualsiasi serata, anche quando per gli altri è tutto
              esaurito. Quello che fai tu è valido subito.
              {!stato.aperta && " L'area per i PR è ancora chiusa: loro non entrano."}
            </p>
          </div>
        )}

        {sonoManager && (
          <Link
            href="/manager"
            className="mb-6 block border border-brand-red/50 bg-brand-red/5 px-4 py-4 transition-colors hover:border-brand-red"
          >
            <span className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-red">
              account manager
            </span>
            <span className="mt-1 block text-sm text-white">
              Ritira i soldi dai PR, consegna prevendite, apri la porta →
            </span>
          </Link>
        )}

        {/* La guida in PDF: due minuti, e il portale diventa un'icona
            sul telefono. Girata anche su WhatsApp ai nuovi PR. */}
        <a
          href="/moduli/guida-pr.pdf"
          target="_blank"
          rel="noreferrer"
          className="mb-6 flex items-center justify-between gap-3 border border-white/15 px-4 py-3 transition-colors hover:border-white/40"
        >
          <span className="text-[12px] leading-snug text-white">
            📱 Mettiti il portale sul telefono
            <span className="block text-[11px] text-brand-gray">
              come entrare e farne un&apos;app · PDF
            </span>
          </span>
          <span className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
            apri
          </span>
        </a>

        <p className="font-tech text-[10px] uppercase tracking-[0.35em] text-brand-gray">
          le tue prevendite
        </p>
        <h1 className="mt-2 font-display text-4xl uppercase leading-none text-white">Serate</h1>

        {eventi.length === 0 ? (
          <div className="mt-8 border border-white/10 px-5 py-8 text-center">
            <p className="text-sm text-white">
              {stato.sono_admin ? "Non c'è nessuna serata in archivio." : "Non sei ancora agganciato a nessuna serata."}
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-brand-gray">
              {stato.sono_admin
                ? "Creane una da /admin/eventi e comparirà qui."
                : "Ogni PR vende solo per le serate a cui lo aggancia Luka. Appena ti aggancia, la trovi qui."}
            </p>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {eventi.length > 1 && (
              <p className="mb-1 text-[11px] leading-relaxed text-brand-gray">
                Hai prevendite per più serate: guarda il giorno prima di entrare, i biglietti
                non si spostano da una all&apos;altra.
              </p>
            )}
            {eventi.map((e) => (
              <div
                key={e.event_id}
                className="border border-l-4 border-white/10 px-4 py-4"
                style={{ borderLeftColor: accentoSerata(e.event_id) }}
              >
                <p
                  className="font-tech text-[10px] uppercase tracking-[0.3em]"
                  style={{ color: accentoSerata(e.event_id) }}
                >
                  {giornoEData(e.starts_at)}
                </p>
                <p className="mt-1 font-display text-xl uppercase leading-none text-white">
                  {e.nome}
                </p>
                <p className="mt-1.5 text-[11px] text-brand-gray">
                  {dataLunga(e.starts_at)}
                  {e.locale ? ` · ${e.locale}` : ""}
                </p>
                <div className="mt-3 flex items-end gap-5">
                  {stato.sono_admin ? (
                    <div>
                      <p className="font-display text-2xl leading-none text-white">{e.vendute}</p>
                      <p className="font-tech text-[9px] uppercase tracking-[0.2em] text-brand-gray">
                        fatte da te
                      </p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="font-display text-2xl leading-none text-brand-red">
                          {e.residue}
                        </p>
                        <p className="font-tech text-[9px] uppercase tracking-[0.2em] text-brand-gray">
                          da vendere
                        </p>
                      </div>
                      <div>
                        <p className="font-display text-2xl leading-none text-white">{e.vendute}</p>
                        <p className="font-tech text-[9px] uppercase tracking-[0.2em] text-brand-gray">
                          fatte
                        </p>
                      </div>
                      <div>
                        <p className="font-display text-2xl leading-none text-white/40">
                          {e.assegnate}
                        </p>
                        <p className="font-tech text-[9px] uppercase tracking-[0.2em] text-brand-gray">
                          avute
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Il pulsante che cercavano. La scritta piccola
                    "tocca per vendere" non la vedeva nessuno: un PR
                    l'ha detto esplicitamente, e ha ragione — su un
                    telefono, al buio, si cerca un rettangolo rosso. */}
                {e.puo_vendere === false ? (
                  <p className="mt-4 border border-white/10 px-3 py-3 text-center text-[11px] leading-relaxed text-brand-gray">
                    Non vendi più per questa serata: qui restano solo i biglietti che hai già fatto.
                  </p>
                ) : (
                  <Link
                    href={`/pr/${e.event_id}#nuovo`}
                    className="mt-4 block bg-brand-red py-3.5 text-center text-[12px] font-semibold uppercase tracking-widest text-white"
                  >
                    vendi prevendita
                  </Link>
                )}
                {/* Sotto, spento: la stessa serata ma aperta in fondo,
                    dove c'è chi ha messo in lista. Sopra si vende,
                    sotto si controlla. */}
                <Link
                  href={`/pr/${e.event_id}#tuoi`}
                  className="mt-2 block border border-white/20 bg-white/[0.03] py-2.5 text-center font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray transition-colors hover:border-white/40 hover:text-white"
                >
                  vedi dettagli
                  {e.vendute > 0 ? ` · ${e.vendute}` : ""}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
