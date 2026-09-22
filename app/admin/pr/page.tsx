"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dataLunga } from "@/lib/eventi";
import { graficaBigliettoUrl } from "@/lib/biglietto";

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

type Fascia = {
  id: string;
  label: string;
  price: number;
  esaurita: boolean;
  countdown_on: boolean;
  percentuale: number | null;
  stock: number | null;
  rimaste: number | null;
  vendute: number | null;
};

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
  under16: boolean;
  pr_alias: string;
  pr_nome: string | null;
  created_at: string;
};

type Config = { aperta: boolean; vendite_on: boolean; soglia: number };

type Cruscotto = {
  consegnate: number;
  vendute: number;
  da_vendere: number;
  in_attesa: number;
  valide: number;
  entrate: number;
  persone: number;
  incasso: number;
  raccolto: number;
  da_incassare: number;
  pr_attivi: number;
  pr_in_debito: number;
};

type PerFascia = {
  id: string;
  label: string;
  prezzo: number;
  vendute: number;
  incasso: number;
  stock: number | null;
  rimaste: number | null;
  countdown_on: boolean;
  /** Partito da sé perché il tetto è agli sgoccioli. */
  countdown_auto: boolean;
  countdown_base: number | null;
  percentuale: number | null;
};

const euro = (n: number) => `${Number(n ?? 0).toFixed(0)} €`;

/**
 * La grafica che il cliente vede sul biglietto.
 *
 * È un'immagine a parte dalla locandina dell'evento: quella nitida la
 * vedono solo i membri iscritti, mentre questa finisce su WhatsApp a
 * gente che non è iscritta a niente. Tenendole separate, si decide cosa
 * far girare senza scoprire la locandina prima del tempo.
 */
function SlotGrafica({
  evento,
  chiave,
  versione,
  onFatto,
}: {
  evento: string;
  chiave: string | null;
  versione: number | null;
  onFatto: () => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [lavorando, setLavorando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function carica(f: File) {
    setLavorando(true);
    setErrore(null);
    const fd = new FormData();
    fd.append("file", f);
    fd.append("event_id", evento);
    const res = await fetch("/api/biglietto-grafica", { method: "POST", body: fd });
    setLavorando(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setErrore(
        j?.error === "troppo-grande"
          ? "Immagine troppo pesante (massimo 12 MB)."
          : j?.error === "non-e-un-immagine"
            ? "Questo file non è un'immagine."
            : `Non caricata (${j?.error ?? res.status}).`,
      );
      return;
    }
    await onFatto();
  }

  async function rimuovi() {
    if (!window.confirm("Togliere la grafica dai biglietti di questa serata?")) return;
    setLavorando(true);
    await fetch("/api/biglietto-grafica", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: evento }),
    });
    setLavorando(false);
    await onFatto();
  }

  return (
    <div className="mt-5">
      <div className="border border-white/10 px-4 py-4">
        <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
          grafica del biglietto
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-brand-gray/70">
          È l&apos;immagine che il cliente si trova sul biglietto, con il QR appoggiato
          sopra. Formato storia (1080×1920) come le locandine: non viene tagliata, quindi
          se è di un altro formato ci sta dentro intera. Il QR copre la parte bassa: tienici
          conto se ci metti scritte.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-brand-gray/70">
          Non è la locandina dell&apos;evento: quella resta riservata ai membri. Questa la
          vede chiunque riceva un biglietto.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) carica(f);
          }}
        />

        {errore && <p className="mt-3 text-[11px] text-brand-red">{errore}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={lavorando}
            className="border border-white/20 px-4 py-3 font-tech text-[10px] uppercase tracking-[0.2em] text-white transition-colors hover:border-brand-red disabled:opacity-50"
          >
            {lavorando ? "Carico…" : chiave ? "Sostituisci" : "Carica la grafica"}
          </button>
          {chiave && (
            <button
              onClick={rimuovi}
              disabled={lavorando}
              className="border border-white/10 px-4 py-3 font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray transition-colors hover:border-brand-red/40 hover:text-brand-red disabled:opacity-50"
            >
              togli
            </button>
          )}
        </div>
      </div>

      {chiave ? (
        <div className="mt-4">
          <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
            come la vede il cliente
          </p>
          <div className="relative mt-2 overflow-hidden border border-white/10 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={graficaBigliettoUrl(chiave, versione)}
              alt="Grafica del biglietto"
              className="block w-full"
            />
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center bg-gradient-to-t from-black via-black/90 to-transparent px-4 pb-5 pt-16">
              <div className="h-24 w-24 bg-white/90" aria-hidden />
              <p className="mt-3 font-display text-xl uppercase leading-none text-white">
                nome cognome
              </p>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 border border-white/10 px-4 py-6 text-center text-[12px] text-brand-gray">
          Nessuna grafica: il biglietto esce con il solo QR su sfondo nero. Funziona
          lo stesso, ma è anonimo.
        </p>
      )}
    </div>
  );
}

/** Un numero grande con la sua etichetta sotto. */
function Riquadro({
  n,
  etichetta,
  colore,
  forte,
}: {
  n: number | string;
  etichetta: string;
  colore?: string;
  forte?: boolean;
}) {
  return (
    <div className="border border-white/10 px-3 py-3">
      <p
        className={`font-display leading-none ${forte ? "text-3xl" : "text-2xl"} ${
          colore ?? "text-white"
        }`}
      >
        {n}
      </p>
      <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
        {etichetta}
      </p>
    </div>
  );
}

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
  const [cruscotto, setCruscotto] = useState<Cruscotto | null>(null);
  const [grafica, setGrafica] = useState<{ key: string | null; v: number | null }>({
    key: null,
    v: null,
  });
  const [perFascia, setPerFascia] = useState<PerFascia[]>([]);
  const [scheda, setScheda] = useState<"pr" | "prezzi" | "grafica" | "biglietti">("pr");
  const [aperto, setAperto] = useState<string | null>(null);
  const [lavorando, setLavorando] = useState(false);

  // Nuova fascia
  const [nuovaLabel, setNuovaLabel] = useState("");
  const [nuovoPrezzo, setNuovoPrezzo] = useState("");
  const [nuovoStock, setNuovoStock] = useState("");

  const caricaEvento = useCallback(async (id: string) => {
    if (!id) return;
    const supabase = createClient();
    const [prRes, fRes, bRes, cRes, pfRes, gRes] = await Promise.all([
      supabase.rpc("admin_pr_lista", { p_event: id }),
      supabase.rpc("pr_fasce", { p_event: id }),
      supabase.rpc("admin_presales", { p_event: id }),
      supabase.rpc("admin_pr_cruscotto", { p_event: id }),
      supabase.rpc("admin_pr_per_fascia", { p_event: id }),
      supabase.rpc("admin_event_ticket", { p_event: id }),
    ]);
    // Stessa regola del resto: se il database si lamenta, si legge.
    const primoErrore = [prRes, fRes, bRes, cRes, pfRes, gRes].find((r) => r.error)?.error;
    setErrore(primoErrore ? primoErrore.message : null);

    setPr(prRes.data ?? []);
    setFasce(fRes.data ?? []);
    setBiglietti(bRes.data ?? []);
    setCruscotto(cRes.data?.[0] ?? null);
    setPerFascia(pfRes.data ?? []);
    setGrafica({
      key: gRes.data?.[0]?.ticket_key ?? null,
      v: gRes.data?.[0]?.ticket_v ?? null,
    });
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
      soglia: Number(cfgRes.data?.[0]?.soglia ?? 13),
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

  /** Da quante prevendite in giù l'avviso parte da solo. */
  async function cambiaSoglia() {
    const risposta = window.prompt(
      "Quando il tetto di una fascia sta per finire, l'avviso ai PR parte da solo.\n\n" +
        "Da quante prevendite rimaste deve partire?",
      String(config?.soglia ?? 13),
    );
    if (risposta === null) return;
    const n = Number(risposta);
    if (!Number.isInteger(n) || n < 1) {
      window.alert("Serve un numero intero, almeno 1.");
      return;
    }
    const supabase = createClient();
    await supabase.rpc("admin_set_soglia_countdown", { p_soglia: n });
    await carica();
    await caricaEvento(evento);
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

  /** "ULTIME 13": da qui in poi i PR vedono una percentuale, non un numero. */
  async function accendiCountdown(f: PerFascia) {
    const avvisoTetto =
      f.rimaste !== null && f.rimaste > 0
        ? `\nATTENZIONE: questa fascia ha già un tetto e ne restano ${f.rimaste}.\n` +
          `Confermando, il tetto scende a quante ne scrivi qui sotto.\n`
        : "";

    const risposta = window.prompt(
      `Ultime prevendite ${f.label.toUpperCase()}.\n` +
        avvisoTetto +
        `\nQuante ne restano da adesso? Da questo momento i PR non vedono\n` +
        `nessun numero: gli compare solo "${f.label} al 75%", che sale mano a mano.\n` +
        `Quando finiscono, per loro la fascia è chiusa (tu continui a vendere).`,
      String(config?.soglia ?? 13),
    );
    if (risposta === null) return;
    const base = Number(risposta);
    if (!Number.isInteger(base) || base < 1) {
      window.alert("Serve un numero intero, almeno 1.");
      return;
    }

    setLavorando(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_tier_countdown", {
      p_tier: f.id,
      p_base: base,
    });
    setLavorando(false);
    if (error) {
      window.alert(error.message);
      return;
    }
    const res = data?.[0];
    if (res?.esito !== "ok") {
      window.alert("Non è andata. Riprova.");
      return;
    }
    window.alert(
      `Acceso. I PR adesso leggono "${f.label} al ${res.percentuale}%".\n` +
        `Il numero vero — ${base} — lo sai solo tu.`,
    );
    await caricaEvento(evento);
  }

  async function spegniCountdown(f: PerFascia) {
    if (
      !window.confirm(
        `Spegnere il countdown su ${f.label}?\n\n` +
          `L'avviso sparisce dalla schermata dei PR e la fascia torna senza tetto.`,
      )
    )
      return;
    setLavorando(true);
    const supabase = createClient();
    await supabase.rpc("admin_tier_countdown_off", { p_tier: f.id });
    setLavorando(false);
    await caricaEvento(evento);
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

        {ev && fasce.length === 0 && (
          <div className="mt-4 border border-amber-400/50 bg-amber-400/5 px-4 py-4">
            <p className="font-display text-xl uppercase leading-none text-amber-300">
              Prima i prezzi
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-white/70">
              Questa serata non ha ancora nessuna fascia di prezzo, e senza prezzo non si può
              fare nessun biglietto — né tu né i PR. Si mettono qui sotto, nella scheda
              &quot;Prezzi&quot;: nome (Donna, Uomo, Prevendita…) e quanto costa.
            </p>
            <button
              onClick={() => {
                setScheda("prezzi");
                document.getElementById("schede")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="mt-3 border border-amber-400/60 px-4 py-3 font-tech text-[10px] uppercase tracking-[0.2em] text-amber-200"
            >
              portami ai prezzi →
            </button>
          </div>
        )}

        {ev && fasce.length > 0 && (
          <Link
            href={`/pr/${evento}`}
            className="mt-4 block border border-brand-red bg-brand-red/10 px-4 py-4 transition-colors hover:bg-brand-red/20"
          >
            <p className="font-display text-lg uppercase leading-none text-white">
              Fai tu una prevendita →
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-white/60">
              Senza limiti di scorte e di blocchetti. Quello che vendi tu è valido subito.
            </p>
          </Link>
        )}

        {/* Il cruscotto della serata: quello che si guardava su Evently */}
        {cruscotto && (
          <div className="mt-5">
            <div className="grid grid-cols-3 gap-3">
              <Riquadro n={cruscotto.consegnate} etichetta="consegnate ai pr" />
              <Riquadro n={cruscotto.vendute} etichetta="vendute" forte />
              <Riquadro n={cruscotto.da_vendere} etichetta="ancora in mano" />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3">
              <Riquadro
                n={cruscotto.in_attesa}
                etichetta="in attesa"
                colore={cruscotto.in_attesa > 0 ? "text-amber-300" : undefined}
              />
              <Riquadro n={cruscotto.valide} etichetta="valide" colore="text-emerald-400" />
              <Riquadro n={cruscotto.entrate} etichetta="entrate" />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3">
              <Riquadro n={euro(cruscotto.incasso)} etichetta="incasso serata" />
              <Riquadro n={euro(cruscotto.raccolto)} etichetta="già in cassa" />
              <Riquadro
                n={euro(cruscotto.da_incassare)}
                etichetta="da ritirare"
                colore={cruscotto.da_incassare > 0 ? "text-brand-red" : "text-emerald-400"}
              />
            </div>

            {/* Come si dividono: su Evently era Donne / Uomini */}
            {perFascia.length > 0 && (
              <div className="mt-3 border border-white/10 px-4 py-3">
                <p className="font-tech text-[9px] uppercase tracking-[0.2em] text-brand-gray">
                  per fascia
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {perFascia.map((f) => (
                    <div key={f.label} className="flex items-baseline justify-between gap-3">
                      <p className="text-sm text-white">
                        {f.label}
                        <span className="ml-2 font-tech text-[10px] text-brand-gray">
                          {euro(f.prezzo)}
                          {f.rimaste !== null ? ` · ne restano ${Math.max(f.rimaste, 0)}` : ""}
                        </span>
                      </p>
                      <p className="flex-shrink-0 font-tech text-[11px] text-white">
                        {f.vendute} <span className="text-brand-gray">· {euro(f.incasso)}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* I tasti delle ultime prevendite: è l'unico modo in cui un PR
                viene a sapere che si sta chiudendo, e lo sa in percentuale. */}
            {perFascia.length > 0 && (
              <div className="mt-3 border border-white/10 px-4 py-4">
                <p className="font-tech text-[9px] uppercase tracking-[0.2em] text-brand-gray">
                  avviso ai pr
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-brand-gray/70">
                  Finché non parte niente, i PR non sanno quante prevendite restano.
                  Quando parte, gli compare una percentuale — mai un numero. Lo accendi
                  tu quando vuoi, e se una fascia ha un tetto parte comunque da solo alle
                  ultime {config?.soglia ?? 13}, anche mentre dormi.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  {perFascia.map((f) => {
                    const acceso = f.countdown_on || f.countdown_auto;
                    return (
                      <button
                        key={f.id}
                        disabled={lavorando}
                        onClick={() =>
                          f.countdown_on ? spegniCountdown(f) : accendiCountdown(f)
                        }
                        className={`border px-4 py-3 text-left transition-colors disabled:opacity-40 ${
                          acceso
                            ? "border-amber-400/60 bg-amber-400/10"
                            : "border-white/20 hover:border-brand-red"
                        }`}
                      >
                        <span className="block font-display text-lg uppercase leading-none text-white">
                          {acceso
                            ? `${f.label} · al ${f.percentuale}%`
                            : `ultime ${config?.soglia ?? 13} · ${f.label}`}
                        </span>
                        <span className="mt-1 block font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                          {f.countdown_auto
                            ? `partito da solo · ne restano ${Math.max(f.rimaste ?? 0, 0)}`
                            : f.countdown_on
                              ? `acceso da te · ne restano ${Math.max(f.rimaste ?? 0, 0)} · premi per spegnere`
                              : f.rimaste !== null
                                ? `tetto a ${f.stock}, ne restano ${f.rimaste} · premi per far partire l'avviso adesso`
                                : "nessun tetto · premi per far partire l'avviso adesso"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={cambiaSoglia}
                  className="mt-3 font-tech text-[9px] uppercase tracking-[0.2em] text-brand-gray hover:text-white"
                >
                  parte da solo alle ultime {config?.soglia ?? 13} · cambia →
                </button>
              </div>
            )}

            <p className="mt-3 text-[10px] leading-relaxed text-brand-gray/60">
              {cruscotto.pr_attivi} PR con prevendite in mano
              {cruscotto.pr_in_debito > 0 && `, di cui ${cruscotto.pr_in_debito} devono ancora portare i soldi`}
              . Tavoli e omaggi non sono ancora nel conto: arrivano con la Fase 3.
            </p>
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
        <div id="schede" className="mt-8 flex gap-2 border-b border-white/10">
          {(
            [
              ["pr", "PR"],
              ["prezzi", "Prezzi"],
              ["grafica", "Grafica"],
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
                      {f.countdown_on
                        ? ` · countdown acceso, ne restano ${Math.max(f.rimaste ?? 0, 0)}`
                        : f.stock !== null
                          ? ` · tetto ${f.stock}, ne restano ${Math.max(f.rimaste ?? 0, 0)}`
                          : " · senza tetto"}
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

        {scheda === "grafica" && ev && (
          <SlotGrafica
            evento={evento}
            chiave={grafica.key}
            versione={grafica.v}
            onFatto={() => caricaEvento(evento)}
          />
        )}

        {scheda === "biglietti" && (
          <div className="mt-5 flex flex-col gap-2">
            {biglietti.map((b) => (
              <div key={b.id} className="border border-white/10 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">
                      {b.nome} {b.cognome}
                      {b.under16 && (
                        <span className="ml-2 font-tech text-[9px] uppercase tracking-[0.15em] text-amber-300">
                          under 16 · delega
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
