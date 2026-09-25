"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { accentoSerata, dataLunga, giornoEData } from "@/lib/eventi";
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
  /** numero di tessera (#0055): arriva con supabase/26_ritiri_in_blocco.sql */
  numero?: number | null;
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

type RigaIngresso = {
  pr_id: string;
  alias: string;
  vendute: number;
  attivo: boolean;
  forzato: boolean;
  usato_at: string | null;
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

type Movimento = {
  quando: string;
  tipo: string;
  pr_alias: string;
  pr_nome: string | null;
  importo: number | null;
  biglietti: number | null;
  nota: string | null;
  segnato_da: string | null;
  id: string;
};

type Conto = {
  pr_alias: string;
  pr_nome: string | null;
  biglietti: number;
  valore_venduto: number;
  soldi_portati: number;
  differenza: number;
  attivi_coperti: boolean;
  nota: string;
};

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
  pos,
  onSposta,
  onSalvaPos,
  onFatto,
}: {
  evento: string;
  chiave: string | null;
  versione: number | null;
  pos: number;
  onSposta: (v: number) => void;
  /** Torna il messaggio del database se non è andata, `null` se è salvata. */
  onSalvaPos: (v: number) => Promise<string | null>;
  onFatto: () => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [lavorando, setLavorando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  // Il cursore salva da solo quando lo lasci: senza questo non si vede
  // che è successo qualcosa, e si resta col dubbio di aver perso tutto.
  const [posStato, setPosStato] = useState<"fermo" | "salvo" | "ok" | "no">("fermo");

  async function salvaPos(v: number) {
    setPosStato("salvo");
    const male = await onSalvaPos(v);
    setPosStato(male ? "no" : "ok");
    if (!male) setTimeout(() => setPosStato("fermo"), 2500);
  }

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
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
              come la vede il cliente
            </p>
            <p className="font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
              QR al {pos}% dall&apos;alto
              {posStato === "salvo" && <span className="ml-2 text-white">salvo…</span>}
              {posStato === "ok" && <span className="ml-2 text-emerald-400">salvato ✓</span>}
              {posStato === "no" && <span className="ml-2 text-brand-red">non salvato</span>}
            </p>
          </div>

          <div className="relative mt-2 overflow-hidden border border-white/10 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={graficaBigliettoUrl(chiave, versione)}
              alt="Grafica del biglietto"
              className="block w-full"
            />
            {pos >= 70 ? (
              <div className="absolute inset-x-0 bottom-0 flex flex-col items-center bg-gradient-to-t from-black via-black/90 to-transparent px-4 pb-5 pt-16">
                <div className="h-24 w-24 bg-white/90" aria-hidden />
                <p className="mt-3 font-display text-xl uppercase leading-none text-white">
                  nome cognome
                </p>
              </div>
            ) : (
              <div
                className="absolute inset-x-0 flex flex-col items-center px-4"
                style={{ top: `${pos}%` }}
              >
                <div className="rounded-sm bg-black/75 px-5 py-4 backdrop-blur-sm">
                  <div className="mx-auto h-24 w-24 bg-white/90" aria-hidden />
                  <p className="mt-3 text-center font-display text-xl uppercase leading-none text-white">
                    nome cognome
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3">
            <input
              type="range"
              min={0}
              max={85}
              step={1}
              value={pos}
              onChange={(e) => onSposta(Number(e.target.value))}
              onPointerUp={() => salvaPos(pos)}
              onTouchEnd={() => salvaPos(pos)}
              onKeyUp={() => salvaPos(pos)}
              className="w-full accent-[#e0181f]"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-brand-gray/70">
              Trascina per appoggiare il quadrato dove la locandina ha spazio — per esempio
              sotto il titolo. Tutto a destra torna in fondo, con la sfumatura nera.
              <strong className="text-white"> Non c&apos;è niente da confermare</strong>: si
              salva da solo quando lasci il cursore, e qui sopra ti dice &quot;salvato&quot;.
            </p>
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
type RigaManager = {
  profile_id: string;
  alias: string;
  nome: string | null;
  numero: number | null;
  attivo: boolean;
  dal: string;
  in_mano: number;
  raccolto: number;
  consegnato: number;
};

type MovimentoAm = {
  id: string;
  quando: string;
  manager: string;
  tipo: string;
  da: string;
  importo: number;
  nota: string | null;
  segnato_da: string | null;
};

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
  const [delega, setDelega] = useState<string | null>(null);
  const [qrPos, setQrPos] = useState<number>(80);
  const [perFascia, setPerFascia] = useState<PerFascia[]>([]);
  const [scheda, setScheda] = useState<
    "pr" | "prezzi" | "grafica" | "biglietti" | "registro" | "manager"
  >("pr");
  // Gli account manager: chi sono e quanti soldi hanno addosso adesso.
  const [managers, setManagers] = useState<RigaManager[]>([]);
  const [movAm, setMovAm] = useState<MovimentoAm[]>([]);
  const [ricevo, setRicevo] = useState<Record<string, string>>({});
  const [registro, setRegistro] = useState<Movimento[]>([]);
  const [conti, setConti] = useState<Conto[]>([]);
  const [aperto, setAperto] = useState<string | null>(null);
  const [lavorando, setLavorando] = useState(false);
  // Cercare un PR per nome o per numero di tessera: con venti PR,
  // scorrere la lista mentre uno ti aspetta davanti non si fa.
  const [cerca, setCerca] = useState("");
  // Quanto ha portato, scritto qui dentro invece che in una finestrella
  // di sistema: una per PR, così due schede aperte non si pestano.
  const [importi, setImporti] = useState<Record<string, string>>({});
  // Le serate passate restano visibili ma non si scelgono, per non
  // segnare un incasso sulla serata sbagliata. Questa le sblocca.
  const [mostraPassate, setMostraPassate] = useState(false);
  // Quante prevendite riceve un PR appena approvato, senza doverci
  // pensare. Sta nel database, qui si legge e si cambia.
  const [iniziali, setIniziali] = useState<string>("");
  // L'ingresso omaggio dei PR: quante prevendite servono, e chi ce l'ha.
  const [sogliaIngresso, setSogliaIngresso] = useState<string>("");
  const [ingressi, setIngressi] = useState<RigaIngresso[]>([]);

  // Nuova fascia
  const [nuovaLabel, setNuovaLabel] = useState("");
  const [nuovoPrezzo, setNuovoPrezzo] = useState("");
  const [nuovoStock, setNuovoStock] = useState("");

  const caricaEvento = useCallback(async (id: string) => {
    if (!id) return;
    const supabase = createClient();
    const [prRes, fRes, bRes, cRes, pfRes, gRes, regRes, contiRes] = await Promise.all([
      supabase.rpc("admin_pr_lista", { p_event: id }),
      supabase.rpc("pr_fasce", { p_event: id }),
      supabase.rpc("admin_presales", { p_event: id }),
      supabase.rpc("admin_pr_cruscotto", { p_event: id }),
      supabase.rpc("admin_pr_per_fascia", { p_event: id }),
      supabase.rpc("admin_event_ticket", { p_event: id }),
      supabase.rpc("admin_registro_soldi", { p_event: id }),
      supabase.rpc("admin_controllo_conti", { p_event: id }),
    ]);
    // Stessa regola del resto: se il database si lamenta, si legge.
    const primoErrore = [prRes, fRes, bRes, cRes, pfRes, gRes, regRes, contiRes].find(
      (r) => r.error,
    )?.error;
    setErrore(primoErrore ? primoErrore.message : null);

    // A parte, e senza far fallire il resto: finché 30_ingresso_pr.sql
    // non è incollato questa semplicemente non c'è.
    supabase
      .rpc("admin_pr_ingressi", { p_event: id })
      .then(({ data }) => setIngressi((data as RigaIngresso[]) ?? []));

    // Idem per i manager: finché 32_account_manager.sql non è incollato
    // queste due non esistono e la scheda lo dice.
    supabase
      .rpc("admin_am_lista", { p_event: id })
      .then(({ data }) => setManagers((data as RigaManager[]) ?? []));
    supabase
      .rpc("admin_am_registro", { p_event: id })
      .then(({ data }) => setMovAm((data as MovimentoAm[]) ?? []));

    setPr(prRes.data ?? []);
    setFasce(fRes.data ?? []);
    setBiglietti(bRes.data ?? []);
    setCruscotto(cRes.data?.[0] ?? null);
    setPerFascia(pfRes.data ?? []);
    setGrafica({
      key: gRes.data?.[0]?.ticket_key ?? null,
      v: gRes.data?.[0]?.ticket_v ?? null,
    });
    setDelega(gRes.data?.[0]?.delega_url ?? null);
    setQrPos(gRes.data?.[0]?.qr_pos ?? 80);
    setRegistro(regRes.data ?? []);
    setConti(contiRes.data ?? []);
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

    createClient()
      .rpc("admin_ingresso_soglia")
      .then(({ data }) => {
        if (typeof data === "number") setSogliaIngresso(String(data));
      });

    createClient()
      .rpc("admin_blocchetti_iniziali")
      .then(({ data }) => {
        if (typeof data === "number") setIniziali(String(data));
      });

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

  async function salvaSogliaIngresso() {
    const n = Number(sogliaIngresso);
    if (!Number.isInteger(n) || n < 0) {
      window.alert("Serve un numero intero, anche zero.");
      return;
    }
    const { error } = await createClient().rpc("admin_set_ingresso_soglia", { p_n: n });
    window.alert(
      error
        ? error.message.includes("admin_set_ingresso_soglia")
          ? "Manca un pezzo sul database: incolla supabase/30_ingresso_pr.sql nel SQL Editor."
          : error.message
        : `Fatto: l'ingresso si accende a ${n} prevendite vendute.`,
    );
    await caricaEvento(evento);
  }

  // L'eccezione: glielo accendi tu anche se non ci è arrivato.
  async function forzaIngresso(riga: RigaIngresso) {
    const spegni = riga.forzato;
    if (
      !window.confirm(
        spegni
          ? `Togliere l'ingresso acceso a mano a ${riga.alias}?\n\nSe ha fatto i numeri resta attivo lo stesso.`
          : `Accendere l'ingresso di ${riga.alias} adesso?\n\nHa fatto ${riga.vendute} prevendite. Resta scritto che l'hai deciso tu.`,
      )
    )
      return;
    const { error } = await createClient().rpc("admin_pr_ingresso_forza", {
      p_event: evento,
      p_pr: riga.pr_id,
      p_on: !spegni,
    });
    if (error) {
      window.alert(
        error.message.includes("admin_pr_ingresso_forza")
          ? "Manca un pezzo sul database: incolla supabase/30_ingresso_pr.sql nel SQL Editor."
          : error.message,
      );
      return;
    }
    await caricaEvento(evento);
  }

  async function salvaIniziali() {
    const n = Number(iniziali);
    if (!Number.isInteger(n) || n < 0) {
      window.alert("Serve un numero intero, anche zero.");
      return;
    }
    const { error } = await createClient().rpc("admin_set_blocchetti_iniziali", { p_n: n });
    window.alert(
      error
        ? error.message.includes("admin_set_blocchetti_iniziali")
          ? "Manca un pezzo sul database: incolla supabase/28_dotazione_iniziale.sql nel SQL Editor."
          : error.message
        : n === 0
          ? "Fatto: i nuovi PR non riceveranno niente in automatico."
          : `Fatto: chi approvi adesso parte con ${n} prevendite.`,
    );
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

  // Quanto ha portato: se il quadratino è vuoto vale "tutto quello che
  // deve", che è il caso normale. Se ci scrive 50 su 120, si segnano 50
  // e diventano validi solo i biglietti che quei 50 coprono — il resto
  // resta scritto come debito suo.
  async function incassa(riga: RigaPR) {
    const scritto = (importi[riga.pr_id] ?? "").trim();
    const importo =
      scritto === ""
        ? Math.max(riga.mancante, 0)
        : Number(scritto.replace(",", "."));

    if (!Number.isFinite(importo) || importo === 0) {
      window.alert("Scrivi quanti euro ti ha portato, o lascia vuoto per l'intero.");
      return;
    }
    if (importo > riga.mancante + 0.01) {
      if (
        !window.confirm(
          `${riga.alias} deve ${euro(riga.mancante)}, tu stai segnando ${euro(importo)}.\n\n` +
            `Vuoi segnarlo lo stesso? Resterà a credito suo.`,
        )
      )
        return;
    }

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
    setImporti((v) => ({ ...v, [riga.pr_id]: "" }));
    window.alert(
      `Segnati ${euro(importo)}. Biglietti diventati validi adesso: ${res?.attivati ?? 0}.\n` +
        `Ancora in attesa: ${res?.ancora_in_attesa ?? 0} · deve ancora ${euro(res?.mancante ?? 0)}.`,
    );
    await caricaEvento(evento);
    await carica();
  }

  // Ritira tutti i blocchetti che ha ancora in mano. Quanti siano lo
  // conta il server: se nel frattempo ne ha venduta un'altra, il numero
  // sullo schermo è già vecchio.
  async function ritiraTutto(riga: RigaPR) {
    if (
      !window.confirm(
        `Ritirare a ${riga.alias} tutti i blocchetti che ha in mano (${riga.residue})?\n\n` +
          `Le prevendite già fatte non si toccano.`,
      )
    )
      return;
    setLavorando(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_pr_ritira_tutto", {
      p_event: evento,
      p_pr: riga.pr_id,
    });
    setLavorando(false);
    if (error) {
      window.alert(
        error.message.includes("admin_pr_ritira_tutto")
          ? "Manca un pezzo sul database: incolla supabase/26_ritiri_in_blocco.sql nel SQL Editor."
          : error.message,
      );
      return;
    }
    window.alert(`Ritirati ${data ?? 0} blocchetti a ${riga.alias}.`);
    await caricaEvento(evento);
    await carica();
  }

  // L'opposto del ritiro: fa partire tutta la squadra. Di default
  // serve solo chi è a zero, così chi ne ha già non si ritrova il
  // doppio senza motivo.
  async function consegnaATutti() {
    const aZero = pr.filter((x) => x.assegnate === 0).length;
    const risposta = window.prompt(
      `Quante prevendite a testa?\n\n` +
        `PR approvati: ${pr.length} · senza niente in mano per questa serata: ${aZero}.`,
      "5",
    );
    if (risposta === null) return;
    const n = Number(risposta);
    if (!Number.isInteger(n) || n <= 0) {
      window.alert("Serve un numero intero maggiore di zero.");
      return;
    }
    const soloAZero =
      aZero === pr.length ||
      window.confirm(
        `Darle SOLO a chi è a zero (${aZero} PR)?\n\n` +
          `OK = solo a loro · Annulla = a tutti e ${pr.length}, anche a chi ne ha già.`,
      );

    setLavorando(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_pr_consegna_tutti", {
      p_event: evento,
      p_quante: n,
      p_solo_a_zero: soloAZero,
    });
    setLavorando(false);
    if (error) {
      window.alert(
        error.message.includes("admin_pr_consegna_tutti")
          ? "Manca un pezzo sul database: incolla supabase/29_consegna_a_tutti.sql nel SQL Editor."
          : error.message,
      );
      return;
    }
    const righe: { alias: string; consegnate: number }[] = data ?? [];
    window.alert(
      righe.length === 0
        ? "Nessuno da servire: hanno già tutti qualcosa in mano."
        : `Consegnate ${n} a testa:\n${righe.map((x) => `· ${x.alias}`).join("\n")}`,
    );
    await caricaEvento(evento);
    await carica();
  }

  // Il ritiro generale: toglie i blocchetti a tutti in un colpo. Serve
  // per chiudere le vendite lasciando lavorare due o tre persone, senza
  // spegnere l'interruttore (che fermerebbe anche loro).
  async function ritiraATutti() {
    const conBlocchetti = pr.filter((x) => x.residue > 0);
    if (conBlocchetti.length === 0) {
      window.alert("Nessuno ha blocchetti in mano per questa serata.");
      return;
    }
    const totale = conBlocchetti.reduce((s, x) => s + x.residue, 0);
    if (
      !window.confirm(
        `Ritirare i blocchetti a TUTTI i PR di questa serata?\n\n` +
          `${conBlocchetti.length} PR, ${totale} prevendite ancora in mano.\n` +
          `Le prevendite già fatte non si toccano. Dopo potrai riconsegnarne a chi vuoi tenere acceso.`,
      )
    )
      return;

    setLavorando(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_pr_ritira_tutti", {
      p_event: evento,
      p_tranne: [],
    });
    setLavorando(false);
    if (error) {
      window.alert(
        error.message.includes("admin_pr_ritira_tutti")
          ? "Manca un pezzo sul database: incolla supabase/26_ritiri_in_blocco.sql nel SQL Editor."
          : error.message,
      );
      return;
    }
    const righe: { alias: string; ritirate: number }[] = data ?? [];
    window.alert(
      righe.length === 0
        ? "Non c'era niente da ritirare."
        : `Ritirati:\n${righe.map((r) => `· ${r.alias}: ${r.ritirate}`).join("\n")}`,
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

  /** Correggere un incasso sbagliato senza cancellarlo: si scrive il contrario. */
  async function storna(m: Movimento) {
    const motivo = window.prompt(
      `Stornare l'incasso di ${euro(m.importo ?? 0)} da ${m.pr_alias}?\n\n` +
        `La riga NON viene cancellata: ne viene scritta una uguale e contraria,\n` +
        `così resta la storia di cos'è successo e i conti tornano.\n\nPerché lo storni?`,
      "",
    );
    if (motivo === null) return;
    setLavorando(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_pr_storna", {
      p_settlement: m.id,
      p_motivo: motivo,
    });
    setLavorando(false);
    if (error) {
      window.alert(error.message);
      return;
    }
    if (data?.[0]?.esito !== "ok") {
      window.alert("Movimento non trovato.");
      return;
    }
    await caricaEvento(evento);
    await carica();
  }

  // ---- Account manager ----

  /** "Leonardo mi ha portato 450 €": glieli scarico di dosso. */
  async function ricevoDa(m: RigaManager) {
    const grezzo = (ricevo[m.profile_id] ?? "").replace(",", ".");
    const importo = grezzo ? Number(grezzo) : Number(m.in_mano);
    if (!importo || importo <= 0) {
      window.alert("Quanto ti ha portato?");
      return;
    }
    if (
      !window.confirm(
        `Hai ricevuto ${euro(importo)} da ${m.alias}?\n\n` +
          "Gli resta addosso solo la differenza. La riga non si cancella più.",
      )
    )
      return;

    setLavorando(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_am_ricevi", {
      p_am: m.profile_id,
      p_event: evento,
      p_importo: importo,
    });
    setLavorando(false);
    if (error) {
      window.alert(error.message);
      return;
    }
    setRicevo((r) => ({ ...r, [m.profile_id]: "" }));
    await caricaEvento(evento);
  }

  async function nominaManager(prId: string, on: boolean, come: string) {
    if (
      !window.confirm(
        on
          ? `Nominare ${come} account manager?\n\nPotrà stare in porta, dare prevendite a ` +
              "chiunque (anche a sé) e ritirare i contanti dagli altri PR."
          : `Togliere il ruolo a ${come}?\n\nI movimenti che ha già fatto restano scritti.`,
      )
    )
      return;
    setLavorando(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_am_nomina", { p_profile: prId, p_on: on });
    setLavorando(false);
    if (error) {
      window.alert(error.message);
      return;
    }
    await caricaEvento(evento);
  }

  async function stornaAm(m: MovimentoAm) {
    const motivo = window.prompt(
      `Stornare ${euro(m.importo)} di ${m.manager}?\n\n` +
        "La riga non si cancella: ne viene scritta una uguale e contraria.\n\nPerché?",
      "",
    );
    if (motivo === null) return;
    setLavorando(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_am_storna", {
      p_movimento: m.id,
      p_nota: motivo,
    });
    setLavorando(false);
    if (error) {
      window.alert(error.message);
      return;
    }
    await caricaEvento(evento);
  }

  /** Il registro su un file, da tenere fuori dal sito. */
  function scaricaRegistro() {
    const righe = [
      ["quando", "tipo", "pr", "nome", "importo", "biglietti", "nota", "segnato da"],
      ...registro.map((m) => [
        new Date(m.quando).toLocaleString("it-IT"),
        m.tipo,
        m.pr_alias,
        m.pr_nome ?? "",
        m.importo !== null ? String(m.importo) : "",
        m.biglietti !== null ? String(m.biglietti) : "",
        m.nota ?? "",
        m.segnato_da ?? "",
      ]),
    ];
    // il punto e virgola è quello che Excel italiano si aspetta
    const csv = righe
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const nome = (ev?.nome ?? "serata").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `soldi-${nome}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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

  // La ricerca guarda alias, nome vero e numero di tessera. Il numero
  // si può scrivere come viene: 55, #55 o 0055.
  const cercato = cerca.trim().toLowerCase().replace(/^#/, "");
  const prVisibili = cercato
    ? pr.filter((x) => {
        const numero = x.numero ?? null;
        return (
          x.alias.toLowerCase().includes(cercato) ||
          (x.nome ?? "").toLowerCase().includes(cercato) ||
          (numero !== null &&
            (String(numero) === String(Number(cercato)) ||
              String(numero).padStart(4, "0").includes(cercato)))
        );
      })
    : pr;
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

        {/* Quanto riceve chi entra adesso */}
        <div className="mt-6 flex flex-col gap-3 border border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
              chi approvi adesso parte con
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-brand-gray/80">
              Appena fai entrare un PR da /admin/crew, gli finiscono in mano queste
              prevendite sulla <span className="text-white">prossima serata</span>, senza
              che tu debba tornare qui. Zero = niente in automatico.
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <input
              inputMode="numeric"
              value={iniziali}
              onChange={(e) => setIniziali(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-20 border border-white/20 bg-black px-3 py-2.5 text-center text-sm text-white outline-none focus:border-brand-red"
            />
            <button
              onClick={salvaIniziali}
              className="border border-white/20 px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.2em] text-white transition-colors hover:border-brand-red"
            >
              salva
            </button>
          </div>
        </div>

        {/* L'ingresso dei PR */}
        <div className="mt-3 flex flex-col gap-3 border border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
              ingresso omaggio del PR
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-brand-gray/80">
              Il suo QR si accende da solo a questo numero di prevendite vendute, e lui
              vede a che punto è. Le eccezioni le fai qui sotto, PR per PR.
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <input
              inputMode="numeric"
              value={sogliaIngresso}
              onChange={(e) => setSogliaIngresso(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-20 border border-white/20 bg-black px-3 py-2.5 text-center text-sm text-white outline-none focus:border-brand-red"
            />
            <button
              onClick={salvaSogliaIngresso}
              className="border border-white/20 px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.2em] text-white transition-colors hover:border-brand-red"
            >
              salva
            </button>
          </div>
        </div>

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

        {/* Quale serata. Con due serate aperte insieme — sabato notte e
            domenica pomeriggio — il colore e il giorno evitano di segnare
            un incasso sulla serata sbagliata. */}
        <div
          className="mt-6 border-l-4 pl-3"
          style={{ borderLeftColor: evento ? accentoSerata(evento) : "transparent" }}
        >
          <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
            serata
            {ev && (
              <span
                className="ml-2"
                style={{ color: accentoSerata(evento) }}
              >
                {giornoEData(ev.starts_at)}
              </span>
            )}
          </p>
          <select
            value={evento}
            onChange={(e) => {
              setEvento(e.target.value);
              caricaEvento(e.target.value);
            }}
            className="mt-2 w-full border border-white/15 bg-black px-3 py-3 text-sm text-white outline-none focus:border-brand-red"
          >
            {eventi.map((e) => (
              <option
                key={e.event_id}
                value={e.event_id}
                // Le serate finite restano scritte — servono a ritrovare i
                // conti — ma non si scelgono per sbaglio mentre si segna
                // un incasso di stasera. La spunta qui sotto le sblocca.
                disabled={e.passato && !mostraPassate && e.event_id !== evento}
              >
                {giornoEData(e.starts_at)} — {e.nome} — {dataLunga(e.starts_at)}
                {e.passato ? " — GIÀ FATTA" : ""}
              </option>
            ))}
          </select>

          {eventi.some((e) => e.passato) && (
            <label className="mt-2 flex items-center gap-2 text-[11px] text-brand-gray">
              <input
                type="checkbox"
                checked={mostraPassate}
                onChange={(e) => setMostraPassate(e.target.checked)}
                className="accent-brand-red"
              />
              sblocca anche le serate già fatte (per rivedere i conti)
            </label>
          )}
          {eventi.filter((e) => !e.passato).length > 1 && (
            <p className="mt-2 text-[11px] leading-relaxed text-brand-gray/70">
              Ci sono più serate aperte: conti, prevendite e incassi sono separati. Un incasso
              segnato qui vale solo per questa.
            </p>
          )}
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
            href="/admin/porta"
            className="mt-4 block border border-white/20 px-4 py-4 transition-colors hover:border-brand-red"
          >
            <p className="font-display text-lg uppercase leading-none text-white">
              Apri la porta →
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-brand-gray">
              Lo scanner dell&apos;ingresso: valida i biglietti e tiene il conto di chi entra.
            </p>
          </Link>
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
              ["registro", "Soldi"],
              ["manager", "Manager"],
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
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={cerca}
                onChange={(e) => setCerca(e.target.value)}
                placeholder="cerca per nome o numero…"
                className="min-w-[10rem] flex-1 border border-white/15 bg-black px-3 py-3 text-sm text-white placeholder-brand-gray/50 outline-none focus:border-brand-red"
              />
              {cerca && (
                <button
                  onClick={() => setCerca("")}
                  className="border border-white/10 px-3 py-3 font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray hover:text-white"
                >
                  pulisci
                </button>
              )}
              <button
                disabled={lavorando || !evento}
                onClick={consegnaATutti}
                className="border border-emerald-400/50 px-4 py-3 font-tech text-[10px] uppercase tracking-[0.2em] text-emerald-300 transition-colors hover:bg-emerald-400/10 disabled:opacity-30"
              >
                consegna a tutti
              </button>
              <button
                disabled={lavorando || pr.every((x) => x.residue <= 0)}
                onClick={ritiraATutti}
                className="border border-brand-red/50 px-4 py-3 font-tech text-[10px] uppercase tracking-[0.2em] text-brand-red transition-colors hover:bg-brand-red/10 disabled:opacity-30"
              >
                ritira a tutti
              </button>
            </div>

            {prVisibili.map((x) => (
              <div key={x.pr_id} className="border border-white/10">
                <button
                  onClick={() => setAperto(aperto === x.pr_id ? null : x.pr_id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">
                      {x.alias}
                      {x.nome && <span className="ml-2 text-brand-gray">{x.nome}</span>}
                      {x.numero != null && (
                        <span className="ml-2 font-tech text-[10px] text-brand-gray/50">
                          #{String(x.numero).padStart(4, "0")}
                        </span>
                      )}
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
                      <button
                        disabled={lavorando || x.residue <= 0}
                        onClick={() => ritiraTutto(x)}
                        className="border border-white/10 px-3 py-2 font-tech text-[10px] text-brand-gray transition-colors hover:border-brand-red hover:text-white disabled:opacity-30"
                      >
                        ritira tutte
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

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <div className="flex items-center border border-white/20 focus-within:border-brand-red">
                        <input
                          inputMode="decimal"
                          value={importi[x.pr_id] ?? ""}
                          onChange={(e) =>
                            setImporti((v) => ({ ...v, [x.pr_id]: e.target.value }))
                          }
                          placeholder={Math.max(x.mancante, 0).toFixed(0)}
                          className="w-24 bg-transparent px-3 py-3 text-sm text-white placeholder-brand-gray/40 outline-none"
                        />
                        <span className="pr-3 font-tech text-[11px] text-brand-gray">€</span>
                      </div>
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
                          attiva lo stesso · resta a debito
                        </button>
                      )}
                    </div>

                    {(() => {
                      const ing = ingressi.find((i) => i.pr_id === x.pr_id);
                      if (!ing) return null;
                      return (
                        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/5 pt-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                              suo ingresso
                            </p>
                            <p
                              className={`mt-0.5 text-sm ${
                                ing.usato_at
                                  ? "text-brand-gray"
                                  : ing.attivo
                                    ? "text-emerald-400"
                                    : "text-white"
                              }`}
                            >
                              {ing.usato_at
                                ? "già entrato"
                                : ing.attivo
                                  ? ing.forzato
                                    ? "attivo (acceso da te)"
                                    : "attivo"
                                  : "non ancora attivo"}
                            </p>
                          </div>
                          <button
                            disabled={lavorando}
                            onClick={() => forzaIngresso(ing)}
                            className="border border-white/20 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.2em] text-white transition-colors hover:border-brand-red disabled:opacity-40"
                          >
                            {ing.forzato ? "togli l'eccezione" : "accendi lo stesso"}
                          </button>
                        </div>
                      );
                    })()}

                    <p className="mt-3 text-[11px] leading-relaxed text-brand-gray/70">
                      Il quadratino vuoto vale tutto quello che deve ({euro(Math.max(x.mancante, 0))}).
                      Scrivici dentro una cifra se ti porta solo una parte: diventano validi i
                      biglietti che quella cifra copre, dal più vecchio, e il resto gli resta
                      segnato come debito.
                      {x.in_attesa > 0 &&
                        " Se ti fidi e vuoi farli valere subito senza aver preso niente, usa il tasto accanto: il debito resta scritto lo stesso."}
                    </p>
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
          <>
            <SlotGrafica
              evento={evento}
              chiave={grafica.key}
              versione={grafica.v}
              pos={qrPos}
              onSposta={setQrPos}
              onSalvaPos={async (v) => {
                const supabase = createClient();
                const { error } = await supabase.rpc("admin_set_event_qr", {
                  p_id: evento,
                  p_pos: v,
                });
                return error ? error.message : null;
              }}
              onFatto={() => caricaEvento(evento)}
            />

            {/* Il modulo per gli under 16: cambia da locale a locale,
                perché cambia la società che tratta i dati. */}
            <div className="mt-5 border border-white/10 px-4 py-4">
              <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
                modulo per gli under 16
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-brand-gray/70">
                Chi compra una prevendita per un ragazzo sotto i 16 anni se lo scarica dal
                biglietto, già pronto da stampare. Scegli quello del locale dove si fa la
                serata: i due hanno società diverse, e l&apos;informativa privacy non è la stessa.
              </p>

              <div className="mt-3 flex flex-col gap-2">
                {[
                  { url: "/moduli/delega-papion.pdf", nome: "PAPI ON THE BEACH", soc: "QFB SRL" },
                  { url: "/moduli/delega-pr1me.pdf", nome: "PR1ME CLUB", soc: "EXO SRLS" },
                ].map((m) => (
                  <button
                    key={m.url}
                    disabled={lavorando}
                    onClick={async () => {
                      const supabase = createClient();
                      await supabase.rpc("admin_set_event_delega", {
                        p_id: evento,
                        p_url: delega === m.url ? null : m.url,
                      });
                      await caricaEvento(evento);
                    }}
                    className={`border px-4 py-3 text-left transition-colors ${
                      delega === m.url
                        ? "border-emerald-400/60 bg-emerald-400/5"
                        : "border-white/15 hover:border-white/40"
                    }`}
                  >
                    <span className="block text-sm text-white">
                      {m.nome}
                      {delega === m.url && (
                        <span className="ml-2 font-tech text-[9px] uppercase text-emerald-400">
                          in uso
                        </span>
                      )}
                    </span>
                    <span className="block font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                      {m.soc}
                    </span>
                  </button>
                ))}
              </div>

              {delega ? (
                <a
                  href={delega}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block border border-white/20 px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.2em] text-white"
                >
                  guarda il modulo →
                </a>
              ) : (
                <p className="mt-3 text-[11px] text-amber-300">
                  Nessun modulo impostato: a un under 16 il biglietto dirà di chiederlo a chi
                  gliel&apos;ha venduto.
                </p>
              )}
            </div>
          </>
        )}

        {scheda === "manager" && (
          <div className="mt-5">
            <div className="border border-white/10 px-4 py-4">
              <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
                account manager
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-brand-gray/70">
                Le persone che lavorano al posto tuo: stanno in porta, consegnano prevendite ai
                PR (anche a sé stessi) e ritirano i contanti. Quello che ritirano resta scritto
                a loro nome finché non te lo portano, e tu lo segni qui. Non possono fare
                omaggi, annullare biglietti, né vedere il cruscotto o le scorte.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {managers.map((m) => (
                <div
                  key={m.profile_id}
                  className={`border px-4 py-3 ${
                    m.attivo ? "border-white/15" : "border-white/5 opacity-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">
                        {m.alias}
                        {m.numero ? (
                          <span className="ml-2 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                            #{m.numero}
                          </span>
                        ) : null}
                        {!m.attivo && (
                          <span className="ml-2 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                            revocato
                          </span>
                        )}
                      </p>
                      {m.nome && <p className="truncate text-[11px] text-brand-gray">{m.nome}</p>}
                      <p className="mt-1 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                        ritirati {euro(m.raccolto ?? 0)} · portati {euro(m.consegnato ?? 0)}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p
                        className={`font-display text-2xl leading-none ${
                          Number(m.in_mano) > 0 ? "text-amber-300" : "text-emerald-400"
                        }`}
                      >
                        {euro(m.in_mano ?? 0)}
                      </p>
                      <p className="font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                        ha in mano
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      inputMode="decimal"
                      value={ricevo[m.profile_id] ?? ""}
                      onChange={(e) =>
                        setRicevo((r) => ({ ...r, [m.profile_id]: e.target.value }))
                      }
                      placeholder={`tutto (${Number(m.in_mano ?? 0).toFixed(0)})`}
                      className="w-32 border border-white/20 bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-brand-gray/50"
                    />
                    <button
                      onClick={() => ricevoDa(m)}
                      disabled={lavorando || Number(m.in_mano ?? 0) <= 0}
                      className="bg-brand-red px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-white disabled:opacity-40"
                    >
                      me li ha portati
                    </button>
                    <button
                      onClick={() => nominaManager(m.profile_id, !m.attivo, m.alias)}
                      disabled={lavorando}
                      className="border border-white/10 px-3 py-2.5 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray transition-colors hover:border-brand-red/40 hover:text-brand-red"
                    >
                      {m.attivo ? "togli il ruolo" : "rimettilo"}
                    </button>
                  </div>
                </div>
              ))}

              {managers.length === 0 && (
                <p className="border border-white/10 px-4 py-6 text-center text-[12px] leading-relaxed text-brand-gray">
                  Nessun manager. Se hai appena incollato{" "}
                  <strong className="text-white">32_account_manager.sql</strong> e qui è vuoto,
                  vuol dire che i tre nomi non combaciavano con quelli scritti sul sito:
                  nominali qui sotto.
                </p>
              )}
            </div>

            {/* Nominarne uno: si sceglie fra i PR approvati */}
            <div className="mt-6 border border-white/10 px-4 py-4">
              <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
                nomina un manager
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const scelto = pr.find((x) => x.pr_id === e.target.value);
                    e.target.value = "";
                    if (scelto) nominaManager(scelto.pr_id, true, scelto.alias);
                  }}
                  className="flex-1 border border-white/20 bg-black px-3 py-2.5 text-sm text-white"
                >
                  <option value="">scegli un PR…</option>
                  {pr
                    .filter((x) => !managers.some((m) => m.profile_id === x.pr_id && m.attivo))
                    .map((x) => (
                      <option key={x.pr_id} value={x.pr_id}>
                        {x.alias}
                        {x.nome ? ` · ${x.nome}` : ""}
                        {x.numero ? ` · #${x.numero}` : ""}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Il registro dei loro movimenti */}
            {movAm.length > 0 && (
              <div className="mt-6">
                <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
                  movimenti dei manager
                </p>
                <div className="mt-3 flex flex-col gap-1.5">
                  {movAm.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-baseline justify-between gap-3 border border-white/10 px-3 py-2"
                    >
                      <span className="min-w-0 truncate text-[12px] text-white">
                        {m.manager}
                        <span className="text-brand-gray">
                          {" "}
                          {m.tipo === "consegna" ? "→ direzione" : `← ${m.da}`}
                        </span>
                      </span>
                      <span
                        className={`flex-shrink-0 text-sm ${
                          Number(m.importo) > 0 ? "text-emerald-400" : "text-brand-gray"
                        }`}
                      >
                        {Number(m.importo) > 0 ? "+" : ""}
                        {euro(m.importo)}
                      </span>
                      <button
                        onClick={() => stornaAm(m)}
                        disabled={lavorando}
                        className="flex-shrink-0 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray hover:text-brand-red"
                      >
                        storna
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {scheda === "registro" && (
          <div className="mt-5">
            {/* Il controllo: i conti tornano? */}
            <div className="border border-white/10 px-4 py-4">
              <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
                i conti tornano?
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-brand-gray/70">
                Rifatti da zero partendo dalle righe, non da un totale salvato. Da guardare
                a fine serata prima di chiudere la cassa.
              </p>

              <div className="mt-4 flex flex-col gap-2">
                {conti.map((c) => {
                  const allarme = c.nota.startsWith("⚠️");
                  return (
                    <div
                      key={c.pr_alias}
                      className={`border px-3 py-3 ${
                        allarme ? "border-brand-red/50 bg-brand-red/5" : "border-white/10"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm text-white">
                          {c.pr_alias}
                          {c.pr_nome && (
                            <span className="ml-2 text-brand-gray">{c.pr_nome}</span>
                          )}
                        </p>
                        <p
                          className={`flex-shrink-0 font-display text-lg leading-none ${
                            c.differenza > 0
                              ? "text-brand-red"
                              : c.differenza < 0
                                ? "text-amber-300"
                                : "text-emerald-400"
                          }`}
                        >
                          {euro(c.differenza)}
                        </p>
                      </div>
                      <p className="mt-1 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                        {c.biglietti} biglietti · venduto {euro(c.valore_venduto)} · portato{" "}
                        {euro(c.soldi_portati)}
                      </p>
                      <p
                        className={`mt-1 text-[11px] ${
                          allarme ? "text-brand-red" : "text-brand-gray/70"
                        }`}
                      >
                        {c.nota}
                      </p>
                    </div>
                  );
                })}

                {conti.length === 0 && (
                  <p className="px-3 py-4 text-center text-[12px] text-brand-gray">
                    Ancora nessun movimento per questa serata.
                  </p>
                )}
              </div>
            </div>

            {/* Il registro vero e proprio */}
            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
                registro · {registro.length} movimenti
              </p>
              <button
                onClick={scaricaRegistro}
                disabled={registro.length === 0}
                className="border border-white/20 px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.2em] text-white transition-colors hover:border-brand-red disabled:opacity-40"
              >
                scarica il registro
              </button>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-brand-gray/70">
              Niente qui dentro si cancella: gli sbagli si correggono scrivendo il movimento
              contrario, e resta scritto tutto. Scarica il file dopo ogni serata e tienilo
              fuori dal sito.
            </p>

            <div className="mt-4 flex flex-col gap-2">
              {registro.map((m) => (
                <div key={m.id + m.quando} className="border border-white/10 px-3 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm text-white">
                      <span
                        className={
                          m.tipo === "incasso"
                            ? "text-emerald-400"
                            : m.tipo === "vendita direzione"
                              ? "text-brand-red"
                              : "text-brand-gray"
                        }
                      >
                        {m.tipo}
                      </span>
                      <span className="ml-2">{m.pr_alias}</span>
                    </p>
                    <p className="flex-shrink-0 font-tech text-[12px] text-white">
                      {m.importo !== null
                        ? euro(m.importo)
                        : `${(m.biglietti ?? 0) > 0 ? "+" : ""}${m.biglietti} prev.`}
                    </p>
                  </div>
                  <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                    {new Date(m.quando).toLocaleString("it-IT")}
                    {m.segnato_da ? ` · ${m.segnato_da}` : ""}
                  </p>
                  {m.nota && (
                    <p className="mt-1 text-[11px] text-brand-gray/80">{m.nota}</p>
                  )}
                  {m.tipo === "incasso" && (
                    <button
                      onClick={() => storna(m)}
                      disabled={lavorando}
                      className="mt-2 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray hover:text-brand-red disabled:opacity-40"
                    >
                      storna
                    </button>
                  )}
                </div>
              ))}

              {registro.length === 0 && (
                <p className="border border-white/10 px-4 py-6 text-center text-[12px] text-brand-gray">
                  Nessun movimento. Compare tutto qui: consegne, incassi, vendite tue.
                </p>
              )}
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
