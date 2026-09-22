"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dataLunga } from "@/lib/eventi";

type EventoAdmin = {
  event_id: string;
  nome: string;
  locale: string | null;
  starts_at: string;
  passato: boolean;
  fasce: number;
  assegnate: number;
  vendute: number;
  attive: number;
  entrate: number;
  incasso: number;
  raccolto: number;
};

type RigaPR = {
  pr_id: string;
  alias: string;
  nome: string | null;
  email: string | null;
  assegnate: number;
  vendute: number;
  residue: number;
  in_attesa: number;
  attive: number;
  entrate: number;
  dovuto: number;
  consegnato: number;
  mancante: number;
};

type Fascia = { id: string; label: string; price: number; stock: number | null; rimaste: number | null };

type BigliettoAdmin = {
  id: string;
  nome: string;
  cognome: string;
  anno_nascita: number;
  telefono: string | null;
  tier_label: string;
  prezzo: number;
  token: string;
  stato: string;
  minorenne: boolean;
  pr_alias: string;
  pr_nome: string | null;
  created_at: string;
};

type Config = { aperta: boolean; vendite_on: boolean };

const euro = (n: number) => `${Number(n ?? 0).toFixed(0)} €`;

/**
 * Prevendite: il pannello di Luka.
 *
 * Qui si consegnano i blocchetti ai PR, si segnano i contanti che
 * arrivano (è quello che rende validi i biglietti) e si tiene il conto
 * di chi deve ancora portare quanto.
 */
export default function AdminPrPage() {
  const router = useRouter();
  const [autorizzato, setAutorizzato] = useState<boolean | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const [config, setConfig] = useState<Config | null>(null);
  const [eventi, setEventi] = useState<EventoAdmin[]>([]);
  const [evento, setEvento] = useState<string>("");
  const [pr, setPr] = useState<RigaPR[]>([]);
  const [fasce, setFasce] = useState<Fascia[]>([]);
  const [biglietti, setBiglietti] = useState<BigliettoAdmin[]>([]);
  const [scheda, setScheda] = useState<"pr" | "prezzi" | "biglietti">("pr");
  const [aperto, setAperto] = useState<string | null>(null);
  const [lavorando, setLavorando] = useState(false);

  // Nuova fascia
  const [nuovaLabel, setNuovaLabel] = useState("");
  const [nuovoPrezzo, setNuovoPrezzo] = useState("");
  const [nuovoStock, setNuovoStock] = useState("");

  const caricaEvento = useCallback(async (id: string) => {
    if (!id) return;
    const supabase = createClient();
    const [prRes, fRes, bRes] = await Promise.all([
      supabase.rpc("admin_pr_lista", { p_event: id }),
      supabase.rpc("pr_fasce", { p_event: id }),
      supabase.rpc("admin_presales", { p_event: id }),
    ]);
    setPr(prRes.data ?? []);
    setFasce(fRes.data ?? []);
    setBiglietti(bRes.data ?? []);
  }, []);

  const carica = useCallback(async () => {
    const supabase = createClient();
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) {
      router.replace("/admin/login");
      return;
    }
    setAutorizzato(true);

    const [cfgRes, evRes] = await Promise.all([
      supabase.rpc("prevendite_stato"),
      supabase.rpc("admin_pr_eventi"),
    ]);

    if (cfgRes.error || evRes.error) {
      setErrore(
        "Il modulo non è installato sul database: incolla supabase/09_prevendite.sql " +
          "nel SQL Editor di Supabase. (" +
          (cfgRes.error?.message ?? evRes.error?.message) +
          ")",
      );
      return;
    }

    setConfig({
      aperta: Boolean(cfgRes.data?.[0]?.aperta),
      vendite_on: Boolean(cfgRes.data?.[0]?.vendite_on),
    });
    const lista: EventoAdmin[] = evRes.data ?? [];
    setEventi(lista);

    setEvento((e) => {
      const scelto = e || lista.find((x) => !x.passato)?.event_id || lista[0]?.event_id || "";
      if (scelto) caricaEvento(scelto);
      return scelto;
    });
  }, [router, caricaEvento]);

  useEffect(() => {
    carica();
  }, [carica]);

  async function cambiaConfig(patch: Partial<Config>) {
    if (!config) return;
    const nuovo = { ...config, ...patch };
    setConfig(nuovo);
    const supabase = createClient();
    await supabase.rpc("admin_prevendite_config", {
      p_aperta: nuovo.aperta,
      p_vendite_on: nuovo.vendite_on,
    });
  }

  async function assegna(prId: string, delta: number) {
    setLavorando(true);
    const supabase = createClient();
    const { data } = await supabase.rpc("admin_pr_assegna", {
      p_event: evento,
      p_pr: prId,
      p_delta: delta,
      p_nota: null,
    });
    setLavorando(false);
    if (data === "troppe") {
      window.alert("Non puoi ritirargliene più di quelle che ha ancora in mano.");
      return;
    }
    await caricaEvento(evento);
    await carica();
  }

  async function incassa(riga: RigaPR) {
    const suggerito = Math.max(riga.mancante, 0).toFixed(0);
    const risposta = window.prompt(
      `Quanti euro ti ha portato ${riga.alias}?\n\n` +
        `Deve ancora: ${euro(riga.mancante)} · in attesa: ${riga.in_attesa} biglietti.\n` +
        `Con l'incasso i biglietti diventano validi, dal più vecchio.`,
      suggerito,
    );
    if (risposta === null) return;
    const importo = Number(risposta.replace(",", "."));
    if (!Number.isFinite(importo) || importo === 0) return;

    setLavorando(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_pr_incassa", {
      p_event: evento,
      p_pr: riga.pr_id,
      p_importo: importo,
      p_nota: null,
    });
    setLavorando(false);
    if (error) {
      window.alert(error.message);
      return;
    }
    const res = data?.[0];
    window.alert(
      `Segnato. Biglietti diventati validi adesso: ${res?.attivati ?? 0}.\n` +
        `Ancora in attesa: ${res?.ancora_in_attesa ?? 0} · deve ancora ${euro(res?.mancante ?? 0)}.`,
    );
    await caricaEvento(evento);
    await carica();
  }

  async function attivaTutto(riga: RigaPR) {
    if (
      !window.confirm(
        `Rendere validi TUTTI i ${riga.in_attesa} biglietti di ${riga.alias} senza aver preso i soldi?\n\n` +
          `Serve in porta, quando salda dopo. Resterà a debito di ${euro(riga.mancante)}.`,
      )
    )
      return;
    setLavorando(true);
    const supabase = createClient();
    await supabase.rpc("admin_pr_attiva_tutto", { p_event: evento, p_pr: riga.pr_id });
    setLavorando(false);
    await caricaEvento(evento);
    await carica();
  }

  async function salvaFascia(id: string | null, label: string, price: string, stock: string) {
    const supabase = createClient();
    await supabase.rpc("admin_tier_salva", {
      p_id: id,
      p_event: evento,
      p_label: label.trim(),
      p_price: Number(price.replace(",", ".")),
      p_stock: stock.trim() === "" ? null : Number(stock),
      p_sort: 0,
    });
    await caricaEvento(evento);
    await carica();
  }

  async function eliminaFascia(id: string) {
    const supabase = createClient();
    const { data } = await supabase.rpc("admin_tier_elimina", { p_id: id });
    if (data === "in_uso") {
      window.alert("Ci sono già biglietti venduti su questa fascia: non si può togliere.");
      return;
    }
    await caricaEvento(evento);
  }

  async function annulla(b: BigliettoAdmin) {
    const motivo = window.prompt(
      `Annullare il biglietto di ${b.nome} ${b.cognome} (${b.pr_alias})?\n\nMotivo:`,
      "",
    );
    if (motivo === null) return;
    const supabase = createClient();
    await supabase.rpc("admin_presale_annulla", { p_id: b.id, p_motivo: motivo });
    await caricaEvento(evento);
    await carica();
  }

  if (autorizzato === null) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="font-display text-6xl text-brand-red animate-pulse-glow">1%</div>
      </main>
    );
  }

  if (errore) {
    return (
      <main className="flex-1 px-5 py-12">
        <div className="mx-auto max-w-lg border border-brand-red/40 px-5 py-6">
          <p className="text-sm leading-relaxed text-white">{errore}</p>
        </div>
      </main>
    );
  }

  const ev = eventi.find((e) => e.event_id === evento);
  const attesaTotale = pr.reduce((s, x) => s + x.in_attesa, 0);

  return (
    <main className="flex-1 px-5 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/admin/dashboard"
          className="font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray hover:text-white"
        >
          ← pannello
        </Link>

        <h1 className="mt-4 font-display text-4xl uppercase leading-none text-white">Prevendite</h1>
        <p className="mt-2 text-xs leading-relaxed text-brand-gray">
          I PR sono la crew approvata. Un biglietto diventa valido solo quando segni
          che i contanti sono arrivati.
        </p>

        {/* L'interruttore */}
        <div className="mt-6 flex flex-col gap-3 border border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
              area PR su /pr
            </p>
            <p className="mt-1 text-sm text-white">
              {config?.aperta ? "Aperta: i PR entrano" : "Chiusa: la vedi solo tu"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => cambiaConfig({ aperta: !config?.aperta })}
              className={`border px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.2em] transition-colors ${
                config?.aperta
                  ? "border-emerald-400/50 text-emerald-300"
                  : "border-white/20 text-white hover:border-brand-red"
              }`}
            >
              {config?.aperta ? "chiudi l'area" : "apri l'area"}
            </button>
            <button
              onClick={() => cambiaConfig({ vendite_on: !config?.vendite_on })}
              className={`border px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.2em] transition-colors ${
                config?.vendite_on
                  ? "border-white/20 text-white hover:border-brand-red"
                  : "border-brand-red/60 text-brand-red"
              }`}
            >
              {config?.vendite_on ? "ferma le vendite" : "riapri le vendite"}
            </button>
          </div>
        </div>

        {/* Quale serata */}
        <div className="mt-6">
          <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">serata</p>
          <select
            value={evento}
            onChange={(e) => {
              setEvento(e.target.value);
              caricaEvento(e.target.value);
            }}
            className="mt-2 w-full border border-white/15 bg-black px-3 py-3 text-sm text-white outline-none focus:border-brand-red"
          >
            {eventi.map((e) => (
              <option key={e.event_id} value={e.event_id}>
                {e.nome} — {dataLunga(e.starts_at)}
                {e.passato ? " (passata)" : ""}
              </option>
            ))}
          </select>
        </div>

        {ev && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="border border-white/10 px-3 py-3">
              <p className="font-display text-2xl leading-none text-white">{ev.vendute}</p>
              <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                vendute
              </p>
            </div>
            <div className="border border-white/10 px-3 py-3">
              <p className="font-display text-2xl leading-none text-emerald-400">{ev.attive}</p>
              <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                valide
              </p>
            </div>
            <div className="border border-white/10 px-3 py-3">
              <p className="font-display text-2xl leading-none text-white">{euro(ev.incasso)}</p>
              <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                incasso atteso
              </p>
            </div>
            <div className="border border-white/10 px-3 py-3">
              <p className="font-display text-2xl leading-none text-white">{euro(ev.raccolto)}</p>
              <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                già in cassa
              </p>
            </div>
          </div>
        )}

        {attesaTotale > 0 && (
          <div className="mt-4 border border-amber-400/40 bg-amber-400/5 px-4 py-3">
            <p className="text-[12px] leading-relaxed text-amber-200">
              <strong>{attesaTotale}</strong> biglietti sono ancora in attesa: quelle persone,
              così, in porta non passano.
            </p>
          </div>
        )}

        {/* Schede */}
        <div className="mt-8 flex gap-2 border-b border-white/10">
          {(
            [
              ["pr", "PR"],
              ["prezzi", "Prezzi"],
              ["biglietti", `Biglietti (${biglietti.length})`],
            ] as const
          ).map(([k, etichetta]) => (
            <button
              key={k}
              onClick={() => setScheda(k)}
              className={`-mb-px border-b-2 px-4 py-3 font-tech text-[10px] uppercase tracking-[0.2em] transition-colors ${
                scheda === k
                  ? "border-brand-red text-white"
                  : "border-transparent text-brand-gray hover:text-white"
              }`}
            >
              {etichetta}
            </button>
          ))}
        </div>

        {scheda === "pr" && (
          <div className="mt-5 flex flex-col gap-2">
            {pr.map((x) => (
              <div key={x.pr_id} className="border border-white/10">
                <button
                  onClick={() => setAperto(aperto === x.pr_id ? null : x.pr_id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">
                      {x.alias}
                      {x.nome && <span className="ml-2 text-brand-gray">{x.nome}</span>}
                    </p>
                    <p className="mt-1 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                      {x.vendute}/{x.assegnate} vendute
                      {x.in_attesa > 0 && (
                        <span className="ml-2 text-amber-300">{x.in_attesa} in attesa</span>
                      )}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p
                      className={`font-display text-xl leading-none ${
                        x.mancante > 0 ? "text-brand-red" : "text-emerald-400"
                      }`}
                    >
                      {euro(x.mancante)}
                    </p>
                    <p className="font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                      da avere
                    </p>
                  </div>
                </button>

                {aperto === x.pr_id && (
                  <div className="border-t border-white/10 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                        consegna
                      </span>
                      {[5, 10, 20, 50].map((n) => (
                        <button
                          key={n}
                          disabled={lavorando}
                          onClick={() => assegna(x.pr_id, n)}
                          className="border border-white/20 px-3 py-2 font-tech text-[10px] text-white transition-colors hover:border-brand-red disabled:opacity-40"
                        >
                          +{n}
                        </button>
                      ))}
                      <button
                        disabled={lavorando || x.residue <= 0}
                        onClick={() => assegna(x.pr_id, -Math.min(5, x.residue))}
                        className="border border-white/10 px-3 py-2 font-tech text-[10px] text-brand-gray transition-colors hover:border-brand-red hover:text-white disabled:opacity-30"
                      >
                        ritira 5
                      </button>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/5 pt-4">
                      <div>
                        <p className="font-display text-lg leading-none text-white">{x.residue}</p>
                        <p className="font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                          in mano
                        </p>
                      </div>
                      <div>
                        <p className="font-display text-lg leading-none text-white">
                          {euro(x.dovuto)}
                        </p>
                        <p className="font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                          ha venduto
                        </p>
                      </div>
                      <div>
                        <p className="font-display text-lg leading-none text-white">
                          {euro(x.consegnato)}
                        </p>
                        <p className="font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                          ha portato
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        disabled={lavorando}
                        onClick={() => incassa(x)}
                        className="bg-brand-red px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-white disabled:opacity-40"
                      >
                        ho ricevuto i soldi
                      </button>
                      {x.in_attesa > 0 && (
                        <button
                          disabled={lavorando}
                          onClick={() => attivaTutto(x)}
                          className="border border-white/20 px-4 py-3 font-tech text-[10px] uppercase tracking-[0.2em] text-white transition-colors hover:border-brand-red disabled:opacity-40"
                        >
                          attiva al volo
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {pr.length === 0 && (
              <p className="border border-white/10 px-4 py-6 text-center text-[12px] text-brand-gray">
                Nessuna crew approvata: i PR escono da /admin/crew.
              </p>
            )}
          </div>
        )}

        {scheda === "prezzi" && (
          <div className="mt-5">
            <div className="flex flex-col gap-2">
              {fasce.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-3 border border-white/10 px-4 py-3"
                >
                  <div>
                    <p className="text-sm text-white">{f.label}</p>
                    <p className="mt-1 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                      {euro(f.price)}
                      {f.stock !== null ? ` · tetto ${f.stock}, ne restano ${Math.max(f.rimaste ?? 0, 0)}` : " · senza tetto"}
                    </p>
                  </div>
                  <button
                    onClick={() => eliminaFascia(f.id)}
                    className="font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray hover:text-brand-red"
                  >
                    togli
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-5 border border-white/10 px-4 py-4">
              <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
                aggiungi una fascia
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <input
                  placeholder="nome (es. Donna)"
                  value={nuovaLabel}
                  onChange={(e) => setNuovaLabel(e.target.value)}
                  className="min-w-[8rem] flex-1 border-b border-white/20 bg-transparent pb-2 text-sm text-white placeholder-brand-gray/50 outline-none focus:border-brand-red"
                />
                <input
                  placeholder="prezzo"
                  value={nuovoPrezzo}
                  onChange={(e) => setNuovoPrezzo(e.target.value)}
                  className="w-24 border-b border-white/20 bg-transparent pb-2 text-sm text-white placeholder-brand-gray/50 outline-none focus:border-brand-red"
                />
                <input
                  placeholder="tetto (vuoto = nessuno)"
                  value={nuovoStock}
                  onChange={(e) => setNuovoStock(e.target.value)}
                  className="w-40 border-b border-white/20 bg-transparent pb-2 text-sm text-white placeholder-brand-gray/50 outline-none focus:border-brand-red"
                />
              </div>
              <button
                disabled={!nuovaLabel.trim() || !nuovoPrezzo.trim()}
                onClick={async () => {
                  await salvaFascia(null, nuovaLabel, nuovoPrezzo, nuovoStock);
                  setNuovaLabel("");
                  setNuovoPrezzo("");
                  setNuovoStock("");
                }}
                className="mt-4 bg-brand-red px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-white disabled:opacity-40"
              >
                aggiungi
              </button>
              <p className="mt-3 text-[10px] leading-relaxed text-brand-gray/60">
                Il prezzo finisce dentro il biglietto al momento della vendita: se lo cambi
                dopo, i biglietti già fatti restano com&apos;erano.
              </p>
            </div>
          </div>
        )}

        {scheda === "biglietti" && (
          <div className="mt-5 flex flex-col gap-2">
            {biglietti.map((b) => (
              <div key={b.id} className="border border-white/10 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">
                      {b.nome} {b.cognome}
                      {b.minorenne && (
                        <span className="ml-2 font-tech text-[9px] uppercase tracking-[0.15em] text-amber-300">
                          minorenne
                        </span>
                      )}
                    </p>
                    <p className="mt-1 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                      {b.tier_label} · {euro(b.prezzo)} · {b.pr_alias}
                      {b.telefono ? ` · ${b.telefono}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-2">
                    <span
                      className={`font-tech text-[9px] uppercase tracking-[0.15em] ${
                        b.stato === "attiva"
                          ? "text-emerald-400"
                          : b.stato === "usata"
                            ? "text-brand-gray"
                            : b.stato === "annullata"
                              ? "text-brand-gray/40 line-through"
                              : "text-amber-300"
                      }`}
                    >
                      {b.stato === "attiva"
                        ? "valido"
                        : b.stato === "usata"
                          ? "entrato"
                          : b.stato === "annullata"
                            ? "annullato"
                            : "in attesa"}
                    </span>
                    {b.stato !== "annullata" && b.stato !== "usata" && (
                      <button
                        onClick={() => annulla(b)}
                        className="font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray hover:text-brand-red"
                      >
                        annulla
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {biglietti.length === 0 && (
              <p className="border border-white/10 px-4 py-6 text-center text-[12px] text-brand-gray">
                Nessun biglietto per questa serata.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
