"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { accentoSerata, dataLunga, giornoEData } from "@/lib/eventi";

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
};

type Stato = {
  aperta: boolean;
  vendite_on: boolean;
  sono_pr: boolean;
  sono_admin: boolean;
  soglia: number;
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
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login?next=/pr");
        return;
      }

      // Se lo script del ruolo non è incollato la chiamata fallisce:
      // non deve portarsi dietro il resto della pagina.
      supabase
        .rpc("is_account_manager")
        .then(({ data }) => setSonoManager(Boolean(data)));

      const { data: st, error: errSt } = await supabase.rpc("prevendite_stato");
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
        const { data, error: errEv } = await supabase.rpc("pr_eventi");
        if (errEv) {
          setErrore(errEv.message);
          setLoading(false);
          return;
        }
        setEventi(data ?? []);
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

  return (
    <main className="flex-1 px-5 py-10">
      <div className="mx-auto w-full max-w-lg">
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
              {stato.sono_admin ? "Non c'è nessuna serata in archivio." : "Non hai ancora prevendite in mano."}
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-brand-gray">
              {stato.sono_admin
                ? "Creane una da /admin/eventi e comparirà qui."
                : "Te le consegna Luka, serata per serata. Appena te ne dà, le trovi qui."}
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
                <Link
                  href={`/pr/${e.event_id}#nuovo`}
                  className="mt-4 block bg-brand-red py-3.5 text-center text-[12px] font-semibold uppercase tracking-widest text-white"
                >
                  vendi prevendita
                </Link>
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
