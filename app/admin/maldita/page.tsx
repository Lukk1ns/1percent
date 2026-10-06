"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { apriWhatsapp, mostraNumero } from "@/lib/whatsapp";
import { SLUG_MALDITA, linkPersonale, oraRoma, giornoOraRoma, riempi } from "@/lib/omaggio";

type Lista = {
  slug: string;
  titolo: string;
  event_id: string;
  aperta: boolean;
  modo: "mano" | "auto";
  posti: number | null;
  chiude_at: string;
  valido_fino: string;
  eta_min: number;
  ig_tag: string | null;
  sorpresa_on: boolean;
  sorpresa_testo: string | null;
  msg_conferma: string | null;
  msg_sorpresa: string | null;
  n_attesa: number;
  n_lista_attesa: number;
  n_approvate: number;
  n_rifiutate: number;
  n_entrate: number;
  n_shot: number;
  n_promo: number;
};

type Richiesta = {
  id: string;
  nome: string;
  cognome: string;
  nascita: string;
  telefono: string;
  instagram: string | null;
  promo: boolean;
  stato: "in_attesa" | "lista_attesa" | "approvata" | "rifiutata";
  token: string;
  created_at: string;
  deciso_at: string | null;
  deciso_da: string | null;
  conferma_at: string | null;
  sorpresa_at: string | null;
  shot_at: string | null;
  qr_stato: string | null;
  entrata_at: string | null;
};

type Filtro = "da_decidere" | "lista_attesa" | "approvata" | "rifiutata" | "tutte";
type Messaggio = "conferma" | "sorpresa";

/** Anni compiuti il giorno della serata. */
function eta(nascita: string, serata: string): number {
  const n = new Date(nascita + "T12:00:00");
  const s = new Date(serata);
  let a = s.getFullYear() - n.getFullYear();
  if (s.getMonth() < n.getMonth() || (s.getMonth() === n.getMonth() && s.getDate() < n.getDate())) a--;
  return a;
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
}

/**
 * DONNA OMAGGIO · il pannello di Luka per MALDITA (script 42).
 *
 * Dall'alto: i numeri, le impostazioni (iscrizioni aperte, posti, modo
 * di approvazione), le richieste con le azioni in blocco, i messaggi
 * WhatsApp (conferma col QR e sorpresa dello shot), la sorpresa.
 */
export default function AdminMalditaPage() {
  const [lista, setLista] = useState<Lista | null>(null);
  const [righe, setRighe] = useState<Richiesta[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [caricato, setCaricato] = useState(false);

  // impostazioni in modifica
  const [aperta, setAperta] = useState(true);
  const [modo, setModo] = useState<"mano" | "auto">("mano");
  const [posti, setPosti] = useState("");
  const [igTag, setIgTag] = useState("");
  const [sorpresaOn, setSorpresaOn] = useState(false);
  const [sorpresaTesto, setSorpresaTesto] = useState("");
  const [msgConferma, setMsgConferma] = useState("");
  const [msgSorpresa, setMsgSorpresa] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [avviso, setAvviso] = useState<string | null>(null);

  const [filtro, setFiltro] = useState<Filtro>("da_decidere");
  const [cerca, setCerca] = useState("");
  const [scelte, setScelte] = useState<Set<string>>(new Set());
  const [lavoro, setLavoro] = useState(false);
  const [msgTab, setMsgTab] = useState<Messaggio>("conferma");
  const [mostraScritte, setMostraScritte] = useState(false);

  const carica = useCallback(async (anche_impostazioni = false) => {
    const supabase = createClient();
    const [l, r] = await Promise.all([
      supabase.rpc("admin_omaggio_lista", { p_slug: SLUG_MALDITA }),
      supabase.rpc("admin_omaggio_richieste", { p_slug: SLUG_MALDITA }),
    ]);
    setCaricato(true);
    if (l.error || r.error) {
      const e = l.error ?? r.error!;
      setErrore(
        e.code === "PGRST202"
          ? "Manca lo script supabase/42_omaggio_donne.sql nel database (va incollato dopo il 40 e il 41)."
          : e.message,
      );
      return;
    }
    setErrore(null);
    const lst = (l.data?.[0] as Lista) ?? null;
    setLista(lst);
    setRighe((r.data ?? []) as Richiesta[]);
    if (lst && anche_impostazioni) {
      setAperta(lst.aperta);
      setModo(lst.modo);
      setPosti(lst.posti === null ? "" : String(lst.posti));
      setIgTag(lst.ig_tag ?? "");
      setSorpresaOn(lst.sorpresa_on);
      setSorpresaTesto(lst.sorpresa_testo ?? "");
      setMsgConferma(lst.msg_conferma ?? "");
      setMsgSorpresa(lst.msg_sorpresa ?? "");
    }
  }, []);

  useEffect(() => {
    const primo = setTimeout(() => carica(true), 0);
    const t = setInterval(() => carica(false), 30000);
    return () => {
      clearTimeout(primo);
      clearInterval(t);
    };
  }, [carica]);

  async function salva(
    sovrascrivi: Partial<{ aperta: boolean; modo: "mano" | "auto"; sorpresaOn: boolean }> = {},
  ) {
    const p = posti.trim() === "" ? null : Number(posti);
    if (p !== null && (!Number.isInteger(p) || p < 0)) {
      setAvviso("I posti devono essere un numero intero (vuoto = non ancora deciso).");
      return;
    }
    const nuovoModo = sovrascrivi.modo ?? modo;
    if (nuovoModo === "auto" && p === null) {
      setAvviso("Per l'automatico servono i posti: scrivi quanti sono.");
      return;
    }
    setSalvando(true);
    setAvviso(null);
    const { data, error } = await createClient().rpc("admin_omaggio_imposta", {
      p_slug: SLUG_MALDITA,
      p_aperta: sovrascrivi.aperta ?? aperta,
      p_modo: nuovoModo,
      p_posti: p,
      p_ig_tag: igTag,
      p_sorpresa_on: sovrascrivi.sorpresaOn ?? sorpresaOn,
      p_sorpresa_testo: sorpresaTesto,
      p_msg_conferma: msgConferma,
      p_msg_sorpresa: msgSorpresa,
    });
    setSalvando(false);
    if (error) {
      setAvviso("Non salvato: " + error.message);
      await carica(true); // lo schermo torna a dire com'è davvero
      return;
    }
    const r = data?.[0] as { esito: string; approvate_ora: number } | undefined;
    setAvviso(
      r?.esito === "ok"
        ? `Salvato ✓${r.approvate_ora ? ` · ${r.approvate_ora} approvate adesso in automatico` : ""}`
        : "Non salvato: " + (r?.esito ?? "errore"),
    );
    await carica(true);
  }

  async function decidi(ids: string[], azione: "approva" | "rifiuta" | "attesa") {
    if (ids.length === 0) return;
    if (azione !== "approva" && ids.length > 1) {
      const parola = azione === "rifiuta" ? "rifiutare" : "rimettere in attesa";
      if (!window.confirm(`Vuoi ${parola} ${ids.length} ragazze?`)) return;
    }
    setLavoro(true);
    const { data, error } = await createClient().rpc("admin_omaggio_decidi", {
      p_ids: ids,
      p_azione: azione,
    });
    setLavoro(false);
    if (error) {
      window.alert("Non è andata: " + error.message);
      return;
    }
    const r = data?.[0] as { fatte: number; saltate: number } | undefined;
    if (r && r.saltate > 0) {
      window.alert(
        azione === "approva"
          ? `Approvate ${r.fatte}. ${r.saltate} non approvate: posti finiti (o già approvate). Alza i posti per farne entrare altre.`
          : `Fatte ${r.fatte}. ${r.saltate} saltate (già entrate o già in quello stato).`,
      );
    }
    setScelte(new Set());
    await carica(false);
  }

  async function riempiPosti() {
    setLavoro(true);
    const { data, error } = await createClient().rpc("admin_omaggio_riempi", { p_slug: SLUG_MALDITA });
    setLavoro(false);
    if (error) return window.alert("Non è andata: " + error.message);
    window.alert(data ? `Approvate ${data} in ordine d'arrivo.` : "Nessuna da approvare (o posti già pieni).");
    await carica(false);
  }

  async function segna(ids: string[], cosa: Messaggio, on: boolean) {
    const { error } = await createClient().rpc("admin_omaggio_scritto", {
      p_ids: ids,
      p_cosa: cosa,
      p_on: on,
    });
    if (error) window.alert("Non segnato: " + error.message);
    await carica(false);
  }

  function testoPer(r: Richiesta, cosa: Messaggio): string {
    const base = cosa === "conferma" ? msgConferma : msgSorpresa;
    return riempi(base, { nome: r.nome, link: linkPersonale(r.token), tag: igTag ? "@" + igTag.replace(/^@/, "") : null });
  }

  function scrivi(r: Richiesta, cosa: Messaggio) {
    apriWhatsapp(r.telefono, testoPer(r, cosa));
    segna([r.id], cosa, true);
  }

  function scaricaCsv() {
    const intest = ["nome", "cognome", "nascita", "eta", "whatsapp", "instagram", "stato", "iscritta", "entrata", "shot", "avvisi prossime serate"];
    const serata = "2026-10-17T22:00:00Z";
    const righeCsv = righe.map((r) =>
      [
        r.nome, r.cognome, r.nascita, eta(r.nascita, serata), r.telefono, r.instagram ? "@" + r.instagram : "",
        r.stato, quando(r.created_at), r.entrata_at ? oraRoma(r.entrata_at) : "", r.shot_at ? oraRoma(r.shot_at) : "",
        r.promo ? "si" : "no",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const blob = new Blob(["﻿" + [intest.join(";"), ...righeCsv].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "donna-omaggio-maldita.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const serataIso = "2026-10-17T22:00:00Z";

  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return righe.filter((r) => {
      const ok =
        filtro === "tutte" ||
        (filtro === "da_decidere" && r.stato === "in_attesa") ||
        r.stato === filtro;
      if (!ok) return false;
      if (!q) return true;
      return `${r.nome} ${r.cognome} ${r.instagram ?? ""} ${r.telefono}`.toLowerCase().includes(q);
    });
  }, [righe, filtro, cerca]);

  const daScrivere = useMemo(
    () =>
      righe.filter(
        (r) => r.stato === "approvata" && !(msgTab === "conferma" ? r.conferma_at : r.sorpresa_at),
      ),
    [righe, msgTab],
  );
  const scritte = useMemo(
    () =>
      righe.filter((r) => r.stato === "approvata" && (msgTab === "conferma" ? r.conferma_at : r.sorpresa_at)),
    [righe, msgTab],
  );

  if (!caricato) {
    return <main className="px-4 py-16 text-center font-tech text-[11px] uppercase tracking-[0.3em] text-brand-gray">un attimo…</main>;
  }

  if (errore || !lista) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <h1 className="font-display text-3xl uppercase text-white">Donna omaggio</h1>
        <p className="mt-4 border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {errore ?? "La lista 'maldita' non c'è nel database: rincolla lo script 42."}
        </p>
      </main>
    );
  }

  const conteggi: Record<Filtro, number> = {
    da_decidere: lista.n_attesa,
    lista_attesa: lista.n_lista_attesa,
    approvata: lista.n_approvate,
    rifiutata: lista.n_rifiutate,
    tutte: righe.length,
  };
  const liberi = lista.posti === null ? null : Math.max(0, lista.posti - lista.n_approvate);
  const tutteScelte = visibili.length > 0 && visibili.every((r) => scelte.has(r.id));
  // In blocco si agisce solo su quello che si vede: una spunta rimasta su una
  // riga filtrata via non deve partire con le altre.
  const scelteVisibili = visibili.filter((r) => scelte.has(r.id)).map((r) => r.id);
  const urlPubblico = typeof window !== "undefined" ? `${window.location.origin}/${SLUG_MALDITA}` : `/${SLUG_MALDITA}`;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      {/* TESTA */}
      <p className="font-tech text-[10px] uppercase tracking-[0.3em] text-brand-red">donna omaggio · sabato 17/10</p>
      <h1 className="mt-1 font-display text-4xl uppercase leading-none text-white">{lista.titolo}</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`/${SLUG_MALDITA}`}
          target="_blank"
          rel="noreferrer"
          className="border border-white/20 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.15em] text-white hover:border-brand-red"
        >
          apri la pagina ↗
        </a>
        <button
          onClick={() => {
            navigator.clipboard.writeText(urlPubblico).then(
              () => setAvviso("Link copiato: " + urlPubblico),
              () => window.prompt("Copia il link:", urlPubblico),
            );
          }}
          className="border border-white/20 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.15em] text-white hover:border-brand-red"
        >
          copia il link da pubblicare
        </button>
        <button
          onClick={scaricaCsv}
          className="border border-white/20 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.15em] text-white hover:border-brand-red"
        >
          scarica elenco (excel)
        </button>
      </div>

      {/* I NUMERI */}
      <section className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="col-span-2 border border-brand-red/60 bg-brand-red/10 px-4 py-4 sm:col-span-1">
          <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">approvate</p>
          <p className="mt-1 font-display text-5xl leading-none text-white">
            {lista.n_approvate}
            <span className="text-2xl text-white/50"> / {lista.posti ?? "?"}</span>
          </p>
          <p className="mt-1 text-[11px] text-white/60">
            {liberi === null ? "posti da decidere" : liberi === 0 ? "posti pieni" : `${liberi} posti liberi`}
          </p>
        </div>
        {[
          ["da decidere", lista.n_attesa],
          ["lista d'attesa", lista.n_lista_attesa],
          ["entrate", lista.n_entrate],
          ["shot", lista.n_shot],
        ].map(([t, n]) => (
          <div key={t} className="border border-white/10 px-4 py-4">
            <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">{t}</p>
            <p className="mt-1 font-display text-4xl leading-none text-white">{n}</p>
          </div>
        ))}
      </section>

      {avviso && (
        <p className="mt-4 border border-white/20 bg-white/5 px-3 py-2.5 text-[13px] text-white">{avviso}</p>
      )}

      {/* IMPOSTAZIONI */}
      <section className="mt-8 border border-white/10 px-4 py-5">
        <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">impostazioni</p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Iscrizioni {aperta ? "aperte" : "chiuse"}</p>
            <p className="text-[11px] text-white/50">Chiudono da sole {giornoOraRoma(lista.chiude_at)}</p>
          </div>
          <button
            onClick={() => {
              setAperta(!aperta);
              salva({ aperta: !aperta });
            }}
            disabled={salvando}
            className={`px-4 py-2.5 font-tech text-[11px] uppercase tracking-[0.15em] ${
              aperta ? "bg-emerald-500 text-black" : "border border-white/30 text-white"
            }`}
          >
            {aperta ? "● aperte · chiudi" : "○ chiuse · apri"}
          </button>
        </div>

        <div className="mt-5">
          <p className="text-sm font-semibold text-white">Posti omaggio</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={posti}
              onChange={(e) => setPosti(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="es. 150"
              className="w-32 border border-white/20 bg-black/40 px-3 py-2.5 text-lg text-white outline-none focus:border-brand-red"
            />
            <button
              onClick={() => salva()}
              disabled={salvando}
              className="bg-brand-red px-4 py-3 font-tech text-[11px] uppercase tracking-[0.15em] text-white disabled:opacity-50"
            >
              {salvando ? "salvo…" : "salva"}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-white/45">
            Vuoto = non ancora deciso. Finiti i posti, chi si iscrive va in lista d&apos;attesa.
          </p>
        </div>

        <div className="mt-5">
          <p className="text-sm font-semibold text-white">Come si approvano</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(
              [
                ["mano", "A mano", "Decidi tu: una per una, oppure ne spunti tante e approvi in blocco."],
                ["auto", "Automatica", "Approvata appena si iscrive, col QR subito, finché ci sono posti. Poi lista d'attesa."],
              ] as const
            ).map(([v, t, d]) => (
              <button
                key={v}
                onClick={() => {
                  if (v === "auto" && posti.trim() === "") {
                    setAvviso("Per l'automatico servono i posti: scrivi quanti sono e poi scegli Automatica.");
                    return;
                  }
                  setModo(v);
                  salva({ modo: v });
                }}
                disabled={salvando}
                className={`border px-4 py-3 text-left ${
                  modo === v ? "border-brand-red bg-brand-red/15" : "border-white/15 hover:border-white/35"
                }`}
              >
                <p className="text-sm font-semibold uppercase tracking-widest text-white">
                  {modo === v ? "● " : "○ "}
                  {t}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-white/60">{d}</p>
              </button>
            ))}
          </div>
          {lista.posti !== null && (lista.n_attesa + lista.n_lista_attesa) > 0 && (liberi ?? 0) > 0 && (
            <button
              onClick={riempiPosti}
              disabled={lavoro}
              className="mt-3 w-full border border-emerald-400/60 px-4 py-3 font-tech text-[11px] uppercase tracking-[0.15em] text-emerald-300 disabled:opacity-50"
            >
              {`riempi i ${liberi} posti liberi in ordine d'arrivo`}
            </button>
          )}
        </div>

        <p className="mt-5 text-[11px] leading-relaxed text-white/45">
          Il QR vale fino alle <strong className="text-white">{oraRoma(lista.valido_fino)}</strong>: dopo, in porta esce
          «SCADUTO». Età minima {lista.eta_min} anni il giorno della serata. La serata in porta si chiama come qui sopra.
        </p>
      </section>

      {/* LE RICHIESTE */}
      <section className="mt-8">
        <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">le richieste</p>
        <div className="mt-3 flex gap-1 overflow-x-auto">
          {(
            [
              ["da_decidere", "da decidere"],
              ["lista_attesa", "lista d'attesa"],
              ["approvata", "approvate"],
              ["rifiutata", "rifiutate"],
              ["tutte", "tutte"],
            ] as const
          ).map(([f, t]) => (
            <button
              key={f}
              onClick={() => {
                setFiltro(f);
                setScelte(new Set());
              }}
              className={`shrink-0 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.15em] ${
                filtro === f ? "bg-white text-black" : "border border-white/15 text-white/70"
              }`}
            >
              {t} · {conteggi[f]}
            </button>
          ))}
        </div>

        <input
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="cerca nome, instagram o numero"
          className="mt-3 w-full border border-white/15 bg-black/40 px-3 py-2.5 text-[15px] text-white outline-none focus:border-brand-red"
        />

        {visibili.length > 0 && (
          <div className="sticky top-12 z-10 mt-3 flex flex-wrap items-center gap-2 border border-white/10 bg-[#0a0a0a]/95 px-3 py-2.5 backdrop-blur">
            <label className="flex items-center gap-2 text-[12px] text-white">
              <input
                type="checkbox"
                checked={tutteScelte}
                onChange={() =>
                  setScelte(tutteScelte ? new Set() : new Set(visibili.map((r) => r.id)))
                }
                className="h-4 w-4 accent-[#e0181f]"
              />
              tutte ({visibili.length})
            </label>
            {scelteVisibili.length > 0 && (
              <>
                <span className="text-[11px] text-white/50">· {scelteVisibili.length} scelte</span>
                <button
                  onClick={() => decidi(scelteVisibili, "approva")}
                  disabled={lavoro}
                  className="bg-emerald-500 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.15em] text-black disabled:opacity-50"
                >
                  ✓ approva
                </button>
                <button
                  onClick={() => decidi(scelteVisibili, "rifiuta")}
                  disabled={lavoro}
                  className="border border-white/30 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.15em] text-white disabled:opacity-50"
                >
                  ✕ rifiuta
                </button>
                <button
                  onClick={() => decidi(scelteVisibili, "attesa")}
                  disabled={lavoro}
                  className="border border-white/15 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.15em] text-white/70 disabled:opacity-50"
                >
                  rimetti da decidere
                </button>
              </>
            )}
          </div>
        )}

        <ul className="mt-2 divide-y divide-white/[0.07] border border-white/10">
          {visibili.length === 0 && (
            <li className="px-4 py-6 text-center text-[13px] text-white/50">Nessuna qui.</li>
          )}
          {visibili.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-3 py-3">
              <input
                type="checkbox"
                checked={scelte.has(r.id)}
                onChange={() => {
                  const s = new Set(scelte);
                  if (s.has(r.id)) s.delete(r.id);
                  else s.add(r.id);
                  setScelte(s);
                }}
                className="mt-1 h-4 w-4 shrink-0 accent-[#e0181f]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-white">
                  {r.nome} {r.cognome}{" "}
                  <span className="font-normal text-white/50">· {eta(r.nascita, serataIso)} anni</span>
                </p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-white/55">
                  <button onClick={() => apriWhatsapp(r.telefono)} className="underline decoration-white/30 underline-offset-2">
                    {mostraNumero(r.telefono)}
                  </button>
                  {r.instagram && (
                    <a
                      href={`https://instagram.com/${r.instagram}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-white/30 underline-offset-2"
                    >
                      @{r.instagram}
                    </a>
                  )}
                  <span>iscritta {quando(r.created_at)}</span>
                </p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  <Etichetta stato={r.stato} />
                  {r.entrata_at && <Badge colore="verde">entrata {oraRoma(r.entrata_at)}</Badge>}
                  {r.shot_at && <Badge colore="verde">shot {oraRoma(r.shot_at)}</Badge>}
                  {r.conferma_at && <Badge>✉ QR mandato</Badge>}
                  {r.sorpresa_at && <Badge>✉ sorpresa mandata</Badge>}
                  {r.deciso_da === "automatica" && <Badge>automatica</Badge>}
                </p>
              </div>
              {(r.stato === "in_attesa" || r.stato === "lista_attesa") && (
                <div className="flex shrink-0 flex-col gap-1.5">
                  <button
                    onClick={() => decidi([r.id], "approva")}
                    disabled={lavoro}
                    className="bg-emerald-500 px-3 py-2 text-sm font-bold text-black disabled:opacity-50"
                    aria-label="approva"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => decidi([r.id], "rifiuta")}
                    disabled={lavoro}
                    className="border border-white/25 px-3 py-2 text-sm text-white disabled:opacity-50"
                    aria-label="rifiuta"
                  >
                    ✕
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* I MESSAGGI */}
      <section className="mt-10 border border-white/10 px-4 py-5">
        <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">messaggi whatsapp · alle approvate</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(
            [
              ["conferma", "1 · Conferma col QR"],
              ["sorpresa", "2 · Sorpresa shot"],
            ] as const
          ).map(([v, t]) => (
            <button
              key={v}
              onClick={() => setMsgTab(v)}
              className={`px-3 py-3 font-tech text-[10px] uppercase tracking-[0.15em] ${
                msgTab === v ? "bg-white text-black" : "border border-white/15 text-white/70"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {msgTab === "sorpresa" && !lista.sorpresa_on && (
          <p className="mt-3 border border-amber-400/50 bg-amber-400/10 px-3 py-2.5 text-[12px] text-amber-100">
            La sorpresa sulle loro pagine è <strong>spenta</strong>: accendila qui sotto prima di mandare il
            messaggio, se no aprono il link e non trovano lo shot.
          </p>
        )}

        <p className="mt-4 text-[11px] text-white/50">
          Il testo. <code>{"{nome}"}</code> diventa il suo nome, <code>{"{link}"}</code> la sua pagina col QR,{" "}
          <code>{"{tag}"}</code> il profilo Instagram da taggare.
        </p>
        <textarea
          value={msgTab === "conferma" ? msgConferma : msgSorpresa}
          onChange={(e) => (msgTab === "conferma" ? setMsgConferma(e.target.value) : setMsgSorpresa(e.target.value))}
          rows={7}
          className="mt-2 w-full border border-white/15 bg-black/40 px-3 py-2.5 text-[14px] leading-relaxed text-white outline-none focus:border-brand-red"
        />
        <button
          onClick={() => salva()}
          disabled={salvando}
          className="mt-2 border border-white/25 px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.15em] text-white disabled:opacity-50"
        >
          {salvando ? "salvo…" : "salva il testo"}
        </button>

        <div className="mt-5">
          {daScrivere.length === 0 ? (
            <p className="text-[13px] text-white/60">
              {lista.n_approvate === 0 ? "Nessuna approvata per ora." : "Fatto: le approvate l'hanno ricevuto tutte ✓"}
            </p>
          ) : (
            <>
              <button
                onClick={() => scrivi(daScrivere[0], msgTab)}
                className="w-full bg-[#25D366] px-4 py-4 text-left text-black"
              >
                <span className="block font-tech text-[10px] uppercase tracking-[0.2em]">
                  da scrivere: {daScrivere.length} · prossima
                </span>
                <span className="mt-0.5 block font-display text-2xl uppercase leading-none">
                  {daScrivere[0].nome} {daScrivere[0].cognome} → apri WhatsApp
                </span>
              </button>
              <p className="mt-2 text-[11px] leading-relaxed text-white/45">
                WhatsApp si apre col messaggio già scritto: premi invia, torna qui e tocca di nuovo per la
                prossima. Si segna da sola come mandata.
              </p>
              <ul className="mt-3 divide-y divide-white/[0.07] border border-white/10">
                {daScrivere.slice(1, 40).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-[13px] text-white">
                      {r.nome} {r.cognome}
                    </span>
                    <span className="flex gap-1.5">
                      <button
                        onClick={() => scrivi(r, msgTab)}
                        className="bg-[#25D366] px-3 py-1.5 font-tech text-[10px] uppercase tracking-[0.1em] text-black"
                      >
                        scrivi
                      </button>
                      <button
                        onClick={() => segna([r.id], msgTab, true)}
                        className="border border-white/20 px-2 py-1.5 font-tech text-[10px] uppercase text-white/60"
                        title="già scritto da un'altra parte"
                      >
                        ✓
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              {daScrivere.length > 40 && (
                <p className="mt-1 text-[11px] text-white/40">…e altre {daScrivere.length - 40}: compaiono man mano.</p>
              )}
            </>
          )}

          {scritte.length > 0 && (
            <div className="mt-4">
              <button onClick={() => setMostraScritte(!mostraScritte)} className="font-tech text-[10px] uppercase tracking-[0.15em] text-white/50">
                {mostraScritte ? "▾" : "▸"} già mandate · {scritte.length}
              </button>
              {mostraScritte && (
                <ul className="mt-2 divide-y divide-white/[0.07] border border-white/10">
                  {scritte.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px] text-white/70">
                      {r.nome} {r.cognome}
                      <span className="flex gap-1.5">
                        <button onClick={() => apriWhatsapp(r.telefono, testoPer(r, msgTab))} className="border border-white/20 px-2 py-1 font-tech text-[10px] uppercase">
                          rimanda
                        </button>
                        <button onClick={() => segna([r.id], msgTab, false)} className="border border-white/20 px-2 py-1 font-tech text-[10px] uppercase">
                          non mandato
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>

      {/* LA SORPRESA */}
      <section className="mt-8 border border-white/10 px-4 py-5">
        <p className="font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">la sorpresa · shot per la storia</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-[12px] leading-relaxed text-white/60">
            Accesa: sulla pagina di ogni approvata compare lo shot offerto, il tasto per scaricare la locandina e, una
            volta dentro, il tasto «il barista conferma lo shot» (uno a testa).
          </p>
          <button
            onClick={() => {
              setSorpresaOn(!sorpresaOn);
              salva({ sorpresaOn: !sorpresaOn });
            }}
            disabled={salvando}
            className={`px-4 py-2.5 font-tech text-[11px] uppercase tracking-[0.15em] ${
              sorpresaOn ? "bg-emerald-500 text-black" : "border border-white/30 text-white"
            }`}
          >
            {sorpresaOn ? "● accesa · spegni" : "○ spenta · accendi"}
          </button>
        </div>
        <p className="mt-4 text-sm font-semibold text-white">Profilo Instagram da taggare</p>
        <div className="mt-2 flex items-stretch">
          <span className="flex items-center border border-r-0 border-white/20 px-3 text-white/50">@</span>
          <input
            value={igTag.replace(/^@/, "")}
            onChange={(e) => setIgTag(e.target.value.replace(/^@/, "").trim())}
            placeholder="profilo del PAPI-ON"
            autoCapitalize="none"
            className="w-56 border border-white/20 bg-black/40 px-3 py-2.5 text-white outline-none focus:border-brand-red"
          />
        </div>
        <p className="mt-4 text-sm font-semibold text-white">Cosa leggono sulla loro pagina</p>
        <textarea
          value={sorpresaTesto}
          onChange={(e) => setSorpresaTesto(e.target.value)}
          rows={3}
          className="mt-2 w-full border border-white/15 bg-black/40 px-3 py-2.5 text-[14px] leading-relaxed text-white outline-none focus:border-brand-red"
        />
        <button
          onClick={() => salva()}
          disabled={salvando}
          className="mt-2 bg-brand-red px-4 py-3 font-tech text-[11px] uppercase tracking-[0.15em] text-white disabled:opacity-50"
        >
          {salvando ? "salvo…" : "salva"}
        </button>
      </section>
    </main>
  );
}

function Etichetta({ stato }: { stato: Richiesta["stato"] }) {
  const s = {
    in_attesa: ["da decidere", "border-amber-400/60 text-amber-200"],
    lista_attesa: ["lista d'attesa", "border-amber-400/40 text-amber-200/80"],
    approvata: ["approvata", "border-emerald-400/60 text-emerald-300"],
    rifiutata: ["rifiutata", "border-white/20 text-white/50"],
  }[stato];
  return <span className={`border px-1.5 py-0.5 font-tech text-[9px] uppercase tracking-[0.12em] ${s[1]}`}>{s[0]}</span>;
}

function Badge({ children, colore }: { children: React.ReactNode; colore?: "verde" }) {
  return (
    <span
      className={`border px-1.5 py-0.5 font-tech text-[9px] uppercase tracking-[0.12em] ${
        colore === "verde" ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" : "border-white/15 text-white/55"
      }`}
    >
      {children}
    </span>
  );
}
