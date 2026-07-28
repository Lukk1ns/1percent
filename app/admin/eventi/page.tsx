"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Locale = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  address: string | null;
  eventi: number;
};

type EventoAdmin = {
  id: string;
  name: string;
  slug: string;
  venue_id: string | null;
  locale: string | null;
  starts_at: string;
  ends_at: string | null;
  reveal_at: string | null;
  teaser: string | null;
  descrizione: string | null;
  published: boolean;
  svelato: boolean;
};

/** Da ISO a "2026-09-12T22:30", il formato che vuole l'input datetime-local. */
function perInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const BOZZA_VUOTA = {
  id: null as string | null,
  name: "",
  venue_id: "",
  starts_at: "",
  ends_at: "",
  reveal_at: "",
  teaser: "",
  descrizione: "",
  published: false,
};

/**
 * Gestione locali ed eventi.
 * Da qui nasce tutto quello che si vede in home e nel calendario.
 */
export default function AdminEventiPage() {
  const router = useRouter();
  const [locali, setLocali] = useState<Locale[]>([]);
  const [eventi, setEventi] = useState<EventoAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [lavorando, setLavorando] = useState(false);

  // Form locale
  const [nuovoLocale, setNuovoLocale] = useState({ name: "", city: "", address: "" });

  // Form evento
  const [bozza, setBozza] = useState({ ...BOZZA_VUOTA });
  const [formAperto, setFormAperto] = useState(false);

  async function carica() {
    const supabase = createClient();
    const [locRes, evRes] = await Promise.all([
      supabase.rpc("admin_venues"),
      supabase.rpc("admin_events"),
    ]);

    if (locRes.error) {
      setErrore(
        "Non disponibile. Hai incollato supabase/03_eventi.sql nel SQL Editor? (" +
          locRes.error.message +
          ")",
      );
      setLoading(false);
      return;
    }
    setLocali((locRes.data ?? []) as Locale[]);
    setEventi((evRes.data ?? []) as EventoAdmin[]);
    setErrore(null);
    setLoading(false);
  }

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function salvaLocale() {
    if (nuovoLocale.name.trim().length < 2) return;
    setLavorando(true);
    const { error } = await createClient().rpc("admin_save_venue", {
      p_id: null,
      p_name: nuovoLocale.name.trim(),
      p_city: nuovoLocale.city.trim() || null,
      p_address: nuovoLocale.address.trim() || null,
    });
    setLavorando(false);
    if (error) return setErrore(error.message);
    setNuovoLocale({ name: "", city: "", address: "" });
    carica();
  }

  async function eliminaLocale(l: Locale) {
    if (!confirm(`Cancellare il locale ${l.name}?`)) return;
    const { error } = await createClient().rpc("admin_delete_venue", { p_id: l.id });
    if (error) return setErrore(error.message);
    carica();
  }

  function apriNuovo() {
    setBozza({ ...BOZZA_VUOTA, venue_id: locali[0]?.id ?? "" });
    setFormAperto(true);
  }

  function apriModifica(e: EventoAdmin) {
    setBozza({
      id: e.id,
      name: e.name,
      venue_id: e.venue_id ?? "",
      starts_at: perInput(e.starts_at),
      ends_at: perInput(e.ends_at),
      reveal_at: perInput(e.reveal_at),
      teaser: e.teaser ?? "",
      descrizione: e.descrizione ?? "",
      published: e.published,
    });
    setFormAperto(true);
  }

  async function salvaEvento() {
    if (bozza.name.trim().length < 2) return setErrore("Serve il nome dell'evento.");
    if (!bozza.starts_at) return setErrore("Serve la data di inizio.");

    setLavorando(true);
    const { error } = await createClient().rpc("admin_save_event", {
      p_id: bozza.id,
      p_name: bozza.name.trim(),
      p_venue_id: bozza.venue_id || null,
      p_starts_at: new Date(bozza.starts_at).toISOString(),
      p_ends_at: bozza.ends_at ? new Date(bozza.ends_at).toISOString() : null,
      p_reveal_at: bozza.reveal_at ? new Date(bozza.reveal_at).toISOString() : null,
      p_teaser: bozza.teaser.trim() || null,
      p_descrizione: bozza.descrizione.trim() || null,
      p_published: bozza.published,
    });
    setLavorando(false);
    if (error) return setErrore(error.message);
    setFormAperto(false);
    setErrore(null);
    carica();
  }

  async function svelaOra(e: EventoAdmin) {
    if (!confirm(`Svelare ${e.name} adesso? Da questo momento lo vedono tutti.`)) return;
    const { error } = await createClient().rpc("admin_reveal_event", { p_id: e.id });
    if (error) return setErrore(error.message);
    carica();
  }

  async function eliminaEvento(e: EventoAdmin) {
    if (!confirm(`Cancellare ${e.name}? Non si torna indietro.`)) return;
    const { error } = await createClient().rpc("admin_delete_event", { p_id: e.id });
    if (error) return setErrore(error.message);
    carica();
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-brand-gray text-sm font-mono">caricamento…</p>
      </main>
    );
  }

  return (
    <main className="flex-1 px-5 py-8 max-w-2xl mx-auto w-full">
      <button
        onClick={() => router.push("/admin/dashboard")}
        className="text-[10px] uppercase tracking-widest text-brand-gray hover:text-white transition-colors mb-6"
      >
        ← Dashboard
      </button>

      <h1 className="font-display text-3xl text-brand-red mb-1">Eventi e locali</h1>
      <p className="text-brand-gray text-sm mb-8">
        Quello che crei qui compare in home e nel calendario.
      </p>

      {errore && (
        <div className="border border-brand-red/40 bg-brand-red/5 px-4 py-3 mb-6">
          <p className="text-brand-red text-xs leading-relaxed">{errore}</p>
        </div>
      )}

      {/* ---------------- LOCALI ---------------- */}
      <section className="mb-12">
        <p className="text-xs uppercase tracking-widest text-brand-gray mb-4">
          Locali ({locali.length})
        </p>

        {locali.length > 0 && (
          <div className="flex flex-col gap-2 mb-5">
            {locali.map((l) => (
              <div
                key={l.id}
                className="border border-white/10 px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-white text-sm truncate">{l.name}</p>
                  <p className="text-[11px] text-brand-gray/60 truncate">
                    {l.city ?? "—"} · {l.eventi} {l.eventi === 1 ? "evento" : "eventi"}
                  </p>
                </div>
                <button
                  onClick={() => eliminaLocale(l)}
                  className="text-[10px] uppercase tracking-widest text-brand-gray hover:text-brand-red transition-colors flex-shrink-0"
                >
                  Elimina
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="border border-white/10 px-4 py-4">
          <p className="text-[10px] uppercase tracking-widest text-brand-gray mb-3">
            Nuovo locale
          </p>
          <input
            type="text"
            placeholder="nome del locale"
            value={nuovoLocale.name}
            onChange={(e) => setNuovoLocale({ ...nuovoLocale, name: e.target.value })}
            className="input-line text-sm mb-3"
          />
          <input
            type="text"
            placeholder="città"
            value={nuovoLocale.city}
            onChange={(e) => setNuovoLocale({ ...nuovoLocale, city: e.target.value })}
            className="input-line text-sm mb-3"
          />
          <input
            type="text"
            placeholder="indirizzo (facoltativo)"
            value={nuovoLocale.address}
            onChange={(e) => setNuovoLocale({ ...nuovoLocale, address: e.target.value })}
            className="input-line text-sm mb-4"
          />
          <button onClick={salvaLocale} disabled={lavorando} className="btn btn-outline w-full">
            Aggiungi locale
          </button>
        </div>
      </section>

      {/* ---------------- EVENTI ---------------- */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs uppercase tracking-widest text-brand-gray">
            Eventi ({eventi.length})
          </p>
          {!formAperto && locali.length > 0 && (
            <button
              onClick={apriNuovo}
              className="text-[10px] uppercase tracking-widest text-brand-red border border-brand-red px-3 py-2 hover:bg-brand-red hover:text-white transition-all"
            >
              + Nuovo evento
            </button>
          )}
        </div>

        {locali.length === 0 && (
          <p className="text-brand-gray/60 text-sm mb-6">
            Prima aggiungi almeno un locale, poi puoi creare gli eventi.
          </p>
        )}

        {formAperto && (
          <div className="border border-brand-red/40 px-4 py-5 mb-6">
            <p className="text-[10px] uppercase tracking-widest text-brand-red mb-4">
              {bozza.id ? "Modifica evento" : "Nuovo evento"}
            </p>

            <label className="block text-[10px] uppercase tracking-widest text-brand-gray mb-1">
              Nome della festa
            </label>
            <input
              type="text"
              placeholder="es. MALDITA"
              value={bozza.name}
              onChange={(e) => setBozza({ ...bozza, name: e.target.value })}
              className="input-line text-sm mb-4"
            />

            <label className="block text-[10px] uppercase tracking-widest text-brand-gray mb-1">
              Locale
            </label>
            <select
              value={bozza.venue_id}
              onChange={(e) => setBozza({ ...bozza, venue_id: e.target.value })}
              className="w-full bg-transparent border-b border-white/20 text-sm text-white py-2 mb-4 outline-none focus:border-brand-red"
            >
              {locali.map((l) => (
                <option key={l.id} value={l.id} className="bg-black">
                  {l.name}
                </option>
              ))}
            </select>

            <label className="block text-[10px] uppercase tracking-widest text-brand-gray mb-1">
              Inizio
            </label>
            <input
              type="datetime-local"
              value={bozza.starts_at}
              onChange={(e) => setBozza({ ...bozza, starts_at: e.target.value })}
              className="w-full bg-transparent border-b border-white/20 text-sm text-white py-2 mb-4 outline-none focus:border-brand-red"
            />

            <label className="block text-[10px] uppercase tracking-widest text-brand-gray mb-1">
              Fine (facoltativa)
            </label>
            <input
              type="datetime-local"
              value={bozza.ends_at}
              onChange={(e) => setBozza({ ...bozza, ends_at: e.target.value })}
              className="w-full bg-transparent border-b border-white/20 text-sm text-white py-2 mb-6 outline-none focus:border-brand-red"
            />

            <div className="border border-white/10 px-4 py-4 mb-5">
              <p className="text-[10px] uppercase tracking-widest text-brand-red mb-1">
                Tienilo nascosto
              </p>
              <p className="text-[11px] text-brand-gray leading-relaxed mb-3">
                Metti una data e fino a quel momento il sito mostra{" "}
                <span className="text-brand-red">?????</span> al posto del nome, con il
                countdown. Lascia vuoto se vuoi svelarlo subito.
              </p>
              <input
                type="datetime-local"
                value={bozza.reveal_at}
                onChange={(e) => setBozza({ ...bozza, reveal_at: e.target.value })}
                className="w-full bg-transparent border-b border-white/20 text-sm text-white py-2 mb-4 outline-none focus:border-brand-red"
              />
              <input
                type="text"
                placeholder="frase da mostrare prima del reveal"
                value={bozza.teaser}
                onChange={(e) => setBozza({ ...bozza, teaser: e.target.value })}
                className="input-line text-sm"
              />
            </div>

            <label className="block text-[10px] uppercase tracking-widest text-brand-gray mb-1">
              Descrizione (facoltativa)
            </label>
            <textarea
              value={bozza.descrizione}
              onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })}
              rows={4}
              className="w-full bg-transparent border border-white/10 text-sm text-white px-3 py-2 mb-5 outline-none focus:border-brand-red resize-none"
            />

            <button
              onClick={() => setBozza({ ...bozza, published: !bozza.published })}
              className={`w-full flex items-center gap-3 px-4 py-3 border mb-5 text-left transition-all ${
                bozza.published ? "border-brand-red bg-brand-red/10" : "border-white/10"
              }`}
            >
              <span
                className={`w-4 h-4 flex-shrink-0 border flex items-center justify-center text-[10px] ${
                  bozza.published ? "border-brand-red bg-brand-red text-white" : "border-white/30"
                }`}
              >
                {bozza.published && "✓"}
              </span>
              <span className="text-sm text-white">
                Pubblicato
                <span className="block text-[11px] text-brand-gray">
                  Se è spento non lo vede nessuno, nemmeno come punti di domanda
                </span>
              </span>
            </button>

            <div className="flex gap-2">
              <button
                onClick={salvaEvento}
                disabled={lavorando}
                className="btn btn-primary flex-1"
              >
                {lavorando ? "Salvo…" : "Salva"}
              </button>
              <button
                onClick={() => {
                  setFormAperto(false);
                  setErrore(null);
                }}
                className="btn btn-ghost px-6"
              >
                Annulla
              </button>
            </div>
          </div>
        )}

        {eventi.length === 0 ? (
          <p className="text-brand-gray/50 text-sm py-8 text-center border border-white/5">
            Nessun evento. Crea il primo.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {eventi.map((e) => (
              <div key={e.id} className="border border-white/10 px-4 py-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-white text-base truncate">{e.name}</p>
                    <p className="text-[11px] text-brand-gray/60">
                      {new Date(e.starts_at).toLocaleString("it-IT", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {e.locale ? ` · ${e.locale}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span
                      className={`text-[9px] uppercase tracking-widest px-2 py-1 border ${
                        e.published
                          ? "text-emerald-400 border-emerald-400/30"
                          : "text-brand-gray border-white/10"
                      }`}
                    >
                      {e.published ? "pubblicato" : "bozza"}
                    </span>
                    {!e.svelato && (
                      <span className="text-[9px] uppercase tracking-widest px-2 py-1 border text-brand-red border-brand-red/40">
                        nascosto
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 mt-3 flex-wrap">
                  <button
                    onClick={() => apriModifica(e)}
                    className="text-[10px] uppercase tracking-widest border border-white/20 text-white px-4 py-2 hover:border-brand-red transition-colors"
                  >
                    Modifica
                  </button>
                  {!e.svelato && (
                    <button
                      onClick={() => svelaOra(e)}
                      className="text-[10px] uppercase tracking-widest border border-brand-red bg-brand-red text-white px-4 py-2 hover:opacity-90 transition-opacity"
                    >
                      Svela adesso
                    </button>
                  )}
                  <button
                    onClick={() => eliminaEvento(e)}
                    className="text-[10px] uppercase tracking-widest border border-white/10 text-brand-gray px-4 py-2 hover:text-brand-red hover:border-brand-red/40 transition-colors"
                  >
                    Elimina
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
