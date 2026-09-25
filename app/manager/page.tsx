"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { accentoSerata, dataLunga, giornoEData } from "@/lib/eventi";

/**
 * L'area degli Account Manager.
 *
 * Tre persone di fiducia che tolgono a Luka il lavoro della serata:
 * stanno in porta, riforniscono i PR di prevendite e ritirano i contanti
 * al posto suo. Quello che ritirano resta **scritto a loro nome** finché
 * non lo consegnano: la pagina glielo ricorda in cima, grande.
 *
 * Quello che qui NON c'è, per decisione di Luka: omaggi, tavoli,
 * annullamenti, classifica, scorte rimaste, percentuali, cruscotto.
 * Solo l'elenco dei PR e quanto c'è da ritirare da ognuno.
 */

type Serata = {
  event_id: string;
  nome: string;
  locale: string | null;
  starts_at: string;
};

type Riga = {
  pr_id: string;
  alias: string;
  nome: string | null;
  numero: number | null;
  telefono: string | null;
  vendute: number;
  in_mano: number;
  dovuto: number;
  raccolto: number;
  da_ritirare: number;
};

type Saldo = {
  in_mano: number;
  raccolto: number;
  consegnato: number;
  movimenti: number;
};

type Movimento = {
  quando: string;
  tipo: string;
  da: string;
  importo: number;
  nota: string | null;
};

const euro = (n: number) => `${Number(n).toFixed(0)} €`;

function ora(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export default function ManagerPage() {
  const router = useRouter();
  const [pronto, setPronto] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const [serate, setSerate] = useState<Serata[]>([]);
  const [serata, setSerata] = useState<string>("");
  const [righe, setRighe] = useState<Riga[]>([]);
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [registro, setRegistro] = useState<Movimento[]>([]);

  // Il PR aperto, e cosa gli si sta facendo
  const [aperto, setAperto] = useState<string | null>(null);
  const [cifra, setCifra] = useState<string>("");
  const [quante, setQuante] = useState<string>("");
  const [lavoro, setLavoro] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);
  // La lista arriva con tutta la crew: davanti chi ha qualcosa in ballo,
  // gli altri dietro l'interruttore, perché a loro si consegna e basta.
  const [tutti, setTutti] = useState(false);
  const [cerca, setCerca] = useState("");

  const caricaSerata = useCallback(async (id: string) => {
    const supabase = createClient();
    const [l, s, r] = await Promise.all([
      supabase.rpc("am_pr_lista", { p_event: id }),
      supabase.rpc("am_saldo", { p_event: id }),
      supabase.rpc("am_registro", { p_event: id }),
    ]);
    const male = [l, s, r].find((x) => x.error)?.error;
    if (male) {
      setErrore(male.message);
      return;
    }
    setRighe((l.data as Riga[]) ?? []);
    setSaldo((s.data?.[0] as Saldo) ?? null);
    setRegistro((r.data as Movimento[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login?next=/manager");
        return;
      }

      const { data: sono, error } = await supabase.rpc("is_account_manager");
      if (error) {
        setErrore(
          "Il ruolo non è installato sul database: va incollato " +
            "supabase/32_account_manager.sql nel SQL Editor.",
        );
        setPronto(true);
        return;
      }
      if (!sono) {
        router.replace("/pr");
        return;
      }

      const { data: ev, error: errEv } = await supabase.rpc("pr_eventi");
      if (errEv) {
        setErrore(errEv.message);
        setPronto(true);
        return;
      }
      const lista = (ev as Serata[]) ?? [];
      setSerate(lista);
      const prima = lista[0]?.event_id ?? "";
      setSerata(prima);
      if (prima) await caricaSerata(prima);
      setPronto(true);
    })();
  }, [router, caricaSerata]);

  async function ritira(r: Riga, tutto: boolean) {
    const importo = tutto ? r.da_ritirare : Number(cifra.replace(",", "."));
    if (!importo || importo <= 0) {
      setEsito("Scrivi quanto hai ritirato.");
      return;
    }
    if (
      !window.confirm(
        `Hai ritirato ${euro(importo)} da ${r.alias}?\n\n` +
          "I suoi biglietti diventano validi e questi soldi restano scritti a tuo nome " +
          "finché non li consegni a Luka.",
      )
    )
      return;

    setLavoro(true);
    setEsito(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("am_incassa", {
      p_event: serata,
      p_pr: r.pr_id,
      p_importo: importo,
    });
    setLavoro(false);
    if (error) {
      setEsito(error.message);
      return;
    }
    const res = data?.[0];
    setEsito(
      `Presi ${euro(importo)} da ${r.alias}. ` +
        (res?.attivati ? `${res.attivati} biglietti adesso sono validi. ` : "") +
        (Number(res?.mancante ?? 0) > 0 ? `Gli restano ${euro(res.mancante)} da darti.` : "È a posto."),
    );
    setCifra("");
    setAperto(null);
    await caricaSerata(serata);
  }

  async function consegna(r: Riga) {
    const n = Number(quante);
    if (!n || n <= 0) {
      setEsito("Quante prevendite gli dai?");
      return;
    }
    setLavoro(true);
    setEsito(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("am_consegna", {
      p_event: serata,
      p_pr: r.pr_id,
      p_quante: n,
    });
    setLavoro(false);
    if (error) {
      setEsito(error.message);
      return;
    }
    setEsito(`${n} prevendite consegnate a ${r.alias}.`);
    setQuante("");
    setAperto(null);
    await caricaSerata(serata);
  }

  if (!pronto) {
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
        <Link
          href="/pr"
          className="mt-8 font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray hover:text-white"
        >
          ← le tue prevendite
        </Link>
      </main>
    );
  }

  const ev = serate.find((s) => s.event_id === serata);
  const daRitirare = righe.reduce((t, r) => t + Math.max(Number(r.da_ritirare), 0), 0);
  const q = cerca.trim().toLowerCase();
  const visibili = righe.filter((r) => {
    if (q) {
      return (
        r.alias.toLowerCase().includes(q) ||
        (r.nome ?? "").toLowerCase().includes(q) ||
        String(r.numero ?? "").includes(q)
      );
    }
    return tutti || r.vendute > 0 || r.in_mano > 0;
  });
  const fermi = righe.filter((r) => r.vendute === 0 && r.in_mano === 0).length;

  return (
    <main className="flex-1 px-5 py-10">
      <div className="mx-auto w-full max-w-lg">
        <p className="font-tech text-[10px] uppercase tracking-[0.35em] text-brand-gray">
          account manager
        </p>
        <h1 className="mt-2 font-display text-4xl uppercase leading-none text-white">
          La serata
        </h1>

        {serate.length === 0 ? (
          <p className="mt-8 border border-white/10 px-5 py-8 text-center text-sm text-brand-gray">
            Non c&apos;è nessuna serata in programma.
          </p>
        ) : (
          <>
            {/* Quale serata: due serate vicine si confondono, il giorno no */}
            <div className="mt-5 flex flex-col gap-2">
              {serate.map((s) => (
                <button
                  key={s.event_id}
                  onClick={async () => {
                    setSerata(s.event_id);
                    setAperto(null);
                    setEsito(null);
                    await caricaSerata(s.event_id);
                  }}
                  className={`border border-l-4 px-4 py-3 text-left transition-colors ${
                    s.event_id === serata
                      ? "border-white/40 bg-white/[0.04]"
                      : "border-white/10 hover:border-white/25"
                  }`}
                  style={{ borderLeftColor: accentoSerata(s.event_id) }}
                >
                  <span
                    className="block font-tech text-[10px] uppercase tracking-[0.3em]"
                    style={{ color: accentoSerata(s.event_id) }}
                  >
                    {giornoEData(s.starts_at)}
                  </span>
                  <span className="mt-1 block text-sm text-white">{s.nome}</span>
                  <span className="mt-0.5 block text-[11px] text-brand-gray">
                    {dataLunga(s.starts_at)}
                    {s.locale ? ` · ${s.locale}` : ""}
                  </span>
                </button>
              ))}
            </div>

            {/* Quanto ha addosso: è la cosa che deve avere sempre sotto gli occhi */}
            <div className="mt-6 border border-brand-red/40 bg-brand-red/5 px-4 py-4">
              <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-red">
                soldi che hai in mano
              </p>
              <p className="mt-1 font-display text-5xl leading-none text-white">
                {euro(saldo?.in_mano ?? 0)}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-white/70">
                Sono a tuo nome finché non li consegni a Luka, che li segna dal suo pannello.
                {daRitirare > 0 && (
                  <>
                    {" "}
                    In giro ce ne sono ancora <strong className="text-white">{euro(daRitirare)}</strong>{" "}
                    da ritirare.
                  </>
                )}
              </p>
            </div>

            {esito && (
              <p className="mt-4 border border-white/15 bg-white/[0.03] px-4 py-3 text-[12px] leading-relaxed text-white">
                {esito}
              </p>
            )}

            {/* I PR */}
            <p className="mt-8 font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">
              i pr di questa serata
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={cerca}
                onChange={(e) => setCerca(e.target.value)}
                placeholder="cerca per nome o tessera"
                className="flex-1 border border-white/20 bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-brand-gray/50"
              />
              {fermi > 0 && !q && (
                <button
                  onClick={() => setTutti((t) => !t)}
                  className="border border-white/15 px-3 py-2.5 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray transition-colors hover:text-white"
                >
                  {tutti ? "solo chi lavora" : `tutta la crew (+${fermi})`}
                </button>
              )}
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {visibili.map((r) => {
                const scoperto = Number(r.da_ritirare);
                const apertoQui = aperto === r.pr_id;
                return (
                  <div
                    key={r.pr_id}
                    className={`border px-4 py-3 ${
                      scoperto > 0 ? "border-amber-400/40" : "border-white/10"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white">
                          {r.alias}
                          {r.numero ? (
                            <span className="ml-2 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                              #{r.numero}
                            </span>
                          ) : null}
                        </p>
                        {r.nome && (
                          <p className="truncate text-[11px] text-brand-gray">{r.nome}</p>
                        )}
                        <p className="mt-1 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                          {r.vendute} vendute · {r.in_mano} ancora in mano
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p
                          className={`font-display text-2xl leading-none ${
                            scoperto > 0 ? "text-amber-300" : "text-emerald-400"
                          }`}
                        >
                          {euro(scoperto > 0 ? scoperto : 0)}
                        </p>
                        <p className="font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                          {scoperto > 0 ? "da ritirare" : "a posto"}
                        </p>
                      </div>
                    </div>

                    {!apertoQui ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            setAperto(r.pr_id);
                            setCifra("");
                            setQuante("");
                            setEsito(null);
                          }}
                          className="border border-white/20 px-3 py-2 font-tech text-[9px] uppercase tracking-[0.15em] text-white transition-colors hover:border-brand-red"
                        >
                          ritira / consegna
                        </button>
                        {r.telefono && (
                          <a
                            href={`tel:${r.telefono}`}
                            className="border border-white/10 px-3 py-2 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray transition-colors hover:text-white"
                          >
                            chiama
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 border-t border-white/10 pt-4">
                        {/* Ritiro */}
                        <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
                          ho ritirato i soldi
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => ritira(r, true)}
                            disabled={lavoro || scoperto <= 0}
                            className="bg-brand-red px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-white disabled:opacity-40"
                          >
                            tutto · {euro(scoperto > 0 ? scoperto : 0)}
                          </button>
                          <span className="font-tech text-[10px] uppercase text-brand-gray">
                            oppure
                          </span>
                          <input
                            inputMode="decimal"
                            value={cifra}
                            onChange={(e) => setCifra(e.target.value)}
                            placeholder="€"
                            className="w-24 border border-white/20 bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-brand-gray/50"
                          />
                          <button
                            onClick={() => ritira(r, false)}
                            disabled={lavoro || !cifra}
                            className="border border-white/25 px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.15em] text-white disabled:opacity-40"
                          >
                            segna
                          </button>
                        </div>

                        {/* Prevendite */}
                        <p className="mt-5 font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
                          gli do altre prevendite
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            inputMode="numeric"
                            value={quante}
                            onChange={(e) => setQuante(e.target.value)}
                            placeholder="quante"
                            className="w-24 border border-white/20 bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-brand-gray/50"
                          />
                          <button
                            onClick={() => consegna(r)}
                            disabled={lavoro || !quante}
                            className="border border-white/25 px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.15em] text-white disabled:opacity-40"
                          >
                            consegna
                          </button>
                        </div>

                        <button
                          onClick={() => setAperto(null)}
                          className="mt-4 font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray hover:text-white"
                        >
                          chiudi
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {visibili.length === 0 && (
                <p className="border border-white/10 px-4 py-6 text-center text-[12px] text-brand-gray">
                  {q
                    ? "Nessun PR con questo nome."
                    : "Per questa serata non ha ancora lavorato nessuno."}
                </p>
              )}
            </div>

            {/* Il suo registro: quello che ha fatto lui, non quello che fanno gli altri */}
            {registro.length > 0 && (
              <div className="mt-8">
                <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">
                  cosa hai fatto stasera
                </p>
                <div className="mt-3 flex flex-col gap-1.5">
                  {registro.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-baseline justify-between gap-3 border border-white/10 px-3 py-2"
                    >
                      <span className="min-w-0 truncate text-[12px] text-white">
                        {m.tipo === "consegna" ? "portati a Luka" : m.da}
                      </span>
                      <span className="flex-shrink-0 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                        {ora(m.quando)}
                      </span>
                      <span
                        className={`flex-shrink-0 text-sm ${
                          Number(m.importo) > 0 ? "text-emerald-400" : "text-brand-gray"
                        }`}
                      >
                        {Number(m.importo) > 0 ? "+" : ""}
                        {euro(m.importo)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8 flex flex-wrap gap-2">
              <Link
                href="/admin/porta"
                className="border border-white/20 px-4 py-3 font-tech text-[10px] uppercase tracking-[0.2em] text-white transition-colors hover:border-brand-red"
              >
                la porta · scanner
              </Link>
              <Link
                href="/pr"
                className="border border-white/10 px-4 py-3 font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray transition-colors hover:text-white"
              >
                le tue prevendite
              </Link>
            </div>

            <p className="mt-6 text-[11px] leading-relaxed text-brand-gray/70">
              {ev ? `${ev.nome} · ` : ""}Ogni ritiro e ogni consegna restano scritti col tuo
              nome e non si cancellano: se sbagli una cifra, dillo a Luka che la corregge con un
              movimento contrario.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
