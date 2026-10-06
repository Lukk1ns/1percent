"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CREW_QUESTIONS } from "@/lib/quiz";
import { ConversazioneDirezione } from "@/components/ConversazioneDirezione";
import { apriWhatsapp, messaggioBenvenutoPR, mostraNumero } from "@/lib/whatsapp";

type RisposteCrew = Record<string, string | { text?: string; tag?: string }> | null;

type Candidatura = {
  id: string;
  member_number: number;
  alias: string;
  nome: string | null;
  email: string | null;
  gender: string | null;
  crew_request_at: string;
  crew_answers: RisposteCrew;
  invitato_da: string | null;
  /** il numero WhatsApp (script 41); manca a chi si è candidato prima */
  telefono?: string | null;
};

// Le serate in programma: approvando un PR si sceglie su quale lavora.
type SerataFutura = { event_id: string; nome: string; starts_at: string };

type Membro = {
  id: string;
  member_number: number;
  alias: string;
  nome: string | null;
  email: string | null;
  crew_since: string | null;
  crew_answers: RisposteCrew;
  // Script 41: senza, questi campi non arrivano proprio.
  telefono?: string | null;
  /** quando Luka gli ha mandato il benvenuto su WhatsApp */
  whatsapp_scritto_at?: string | null;
  /** le serate (non passate) a cui è agganciato, già in frase */
  serate?: string | null;
};

/** Il nome con cui lo saluta il messaggio: il primo del nome vero. */
function nomeBreve(x: { nome: string | null; alias: string }): string {
  return x.nome?.trim().split(/\s+/)[0] || x.alias;
}

/** Appena approvato: il riquadro col tasto del benvenuto. */
type AppenaEntrato = {
  id: string;
  chi: string;
  saluto: string;
  info: string;
  telefono: string | null;
  serata: string | null;
};

/** Traduce una risposta grezza nel testo leggibile della domanda corrispondente. */
function leggiRisposta(
  questionId: string,
  valore: string | { text?: string; tag?: string } | undefined,
): { domanda: string; risposta: string; libero?: string } | null {
  const q = CREW_QUESTIONS.find((x) => x.id === questionId);
  if (!q || valore === undefined) return null;

  if (q.type === "choice") {
    // Può aver scelto un'opzione, aver scritto la sua, o tutte e due
    const scelta = typeof valore === "string" ? valore : valore.tag;
    const scritto = typeof valore === "object" ? valore.text?.trim() : undefined;
    return {
      domanda: q.text,
      risposta: scelta
        ? (q.options.find((o) => o.id === scelta)?.text ?? scelta)
        : "— ha scritto la sua",
      libero: scritto || undefined,
    };
  }
  if (q.type === "hybrid" && typeof valore === "object") {
    return { domanda: q.text, risposta: valore.tag ?? "—", libero: valore.text || undefined };
  }
  if (q.type === "text" && typeof valore === "string") {
    // Il testo libero è la parte che vale: lo mostro in evidenza, non come etichetta.
    const t = valore.trim();
    return t
      ? { domanda: q.text, risposta: "", libero: t }
      : { domanda: q.text, risposta: "— non ha risposto" };
  }
  return null;
}

/** Le risposte al questionario, in chiaro. */
function Risposte({ risposte }: { risposte: RisposteCrew }) {
  if (!risposte) {
    return <p className="text-xs text-brand-gray/50">Nessuna risposta registrata.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {CREW_QUESTIONS.map((q) => {
        const r = leggiRisposta(q.id, risposte[q.id]);
        if (!r) return null;
        return (
          <div key={q.id}>
            <p className="text-[10px] uppercase tracking-widest text-brand-gray/50 mb-1">
              {r.domanda}
            </p>
            {r.risposta && <p className="text-sm text-white">{r.risposta}</p>}
            {r.libero && (
              <p className="text-sm text-brand-red/90 italic mt-1 whitespace-pre-wrap">
                «{r.libero}»
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Pannello staff.
 * Nell'1% non si entra da soli: chi vuole si candida all'iscrizione,
 * qui leggi le risposte e decidi. Poi gli scrivi tu.
 */
export default function AdminCrewPage() {
  const router = useRouter();
  const [candidature, setCandidature] = useState<Candidatura[]>([]);
  const [membri, setMembri] = useState<Membro[]>([]);
  const [quantiCrew, setQuantiCrew] = useState<number | null>(null);
  const [aperto, setAperto] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [lavorando, setLavorando] = useState<string | null>(null);
  // Cercare per nome o numero di tessera, come in Prevendite: con
  // ottanta persone nello staff scorrere la lista non si fa.
  const [cerca, setCerca] = useState("");
  // Con chi è aperta la chat (id del profilo): per fare domande a chi si
  // candida prima di decidere. La trova nei suoi Messaggi sul sito.
  const [chat, setChat] = useState<string | null>(null);
  // Ogni PR vende solo per le serate a cui è agganciato (script 39):
  // approvando si sceglie la sua. Di partenza la più vicina.
  const [serate, setSerate] = useState<SerataFutura[]>([]);
  const [serataScelta, setSerataScelta] = useState<Record<string, string>>({});
  // Il benvenuto su WhatsApp (6 ott): appena approvato, e la lista di chi
  // non ha ancora ricevuto niente. Con ogni PR una chat aperta, come prima.
  const [appenaEntrato, setAppenaEntrato] = useState<AppenaEntrato | null>(null);
  const [senzaNumeroAperti, setSenzaNumeroAperti] = useState(false);

  async function carica() {
    const supabase = createClient();
    const [reqRes, crewRes, membriRes, eventiRes] = await Promise.all([
      supabase.rpc("admin_crew_requests"),
      supabase.rpc("crew_count"),
      supabase.rpc("admin_crew_answers"),
      supabase.rpc("admin_pr_eventi"),
    ]);
    if (!eventiRes.error) {
      setSerate(
        ((eventiRes.data ?? []) as (SerataFutura & { passato: boolean })[])
          .filter((e) => !e.passato)
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      );
    }

    if (reqRes.error) {
      setErrore(
        "Non disponibile. Hai incollato supabase/RESET.sql nel SQL Editor? (" +
          reqRes.error.message +
          ")",
      );
      setLoading(false);
      return;
    }
    setCandidature((reqRes.data ?? []) as Candidatura[]);
    setMembri((membriRes.data ?? []) as Membro[]);
    if (typeof crewRes.data === "number") setQuantiCrew(crewRes.data);
    setErrore(null);
    setLoading(false);
  }

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decidi(c: Candidatura, approva: boolean) {
    const serata = serataScelta[c.id] ?? serate[0]?.event_id;
    const nomeSerata = serate.find((s) => s.event_id === serata)?.nome;
    const verbo = approva ? "Far entrare" : "Rifiutare";
    if (
      !confirm(
        `${verbo} ${c.nome ?? c.alias} (${c.alias})?` +
          (approva && nomeSerata ? `\n\nPotrà vendere solo per: ${nomeSerata}` : ""),
      )
    )
      return;

    setLavorando(c.id);
    const supabase = createClient();
    let { data, error } = await supabase.rpc(
      approva ? "admin_approve_crew" : "admin_reject_crew",
      approva && serata ? { p_profile: c.id, p_event: serata } : { p_profile: c.id },
    );
    // Finché supabase/39_pr_per_serata.sql non è incollato la funzione non
    // conosce la serata: si approva come prima, senza.
    if (approva && serata && error?.code === "PGRST202") {
      ({ data, error } = await supabase.rpc("admin_approve_crew", { p_profile: c.id }));
    }
    setLavorando(null);
    if (error) {
      setErrore(error.message);
      return;
    }

    // Chi entra parte già con i suoi blocchetti sulla prossima serata:
    // la risposta dice quanti e su quale, così si sa subito se ha
    // qualcosa da vendere o se bisogna ancora creare la serata.
    // Formato: "ok:<quanti>:<serata>".
    if (approva && typeof data === "string") {
      const [, quanti, serata] = data.split(":");
      const n = Number(quanti ?? 0);
      setAppenaEntrato({
        id: c.id,
        chi: c.nome ?? c.alias,
        saluto: nomeBreve(c),
        telefono: c.telefono ?? null,
        serata: serata || nomeSerata || null,
        info:
          n > 0
            ? `Agganciato a ${serata}: gli ho già consegnato ${n} prevendite.`
            : serata
            ? `Agganciato a ${serata}. Blocchetti non consegnati (ne aveva già, o le prevendite di partenza sono a zero): glieli dai tu da /admin/pr.`
            : `Non c'è nessuna serata in programma: quando la crei, agganciaglielo da /admin/pr.`,
      });
    }
    carica();
  }

  /** Apre la chat col benvenuto già scritto, e lo segna come scritto. */
  async function mandaBenvenuto(id: string, telefono: string, saluto: string, serate: string | null) {
    apriWhatsapp(telefono, messaggioBenvenutoPR(saluto, serate));
    await createClient().rpc("admin_whatsapp_scritto", { p_profile: id, p_scritto: true });
    carica();
  }

  /** Per chi ha già una chat aperta con Luka: lo toglie dalla lista senza scrivergli. */
  async function segnaScritto(id: string, scritto: boolean) {
    await createClient().rpc("admin_whatsapp_scritto", { p_profile: id, p_scritto: scritto });
    carica();
  }

  /** Numero sbagliato, o dato a voce: lo mette Luka. */
  async function correggiNumero(m: Membro) {
    const nuovo = prompt(`Numero WhatsApp di ${m.nome ?? m.alias}:`, m.telefono ?? "");
    if (nuovo === null || !nuovo.trim()) return;
    const { error } = await createClient().rpc("admin_set_numero", {
      p_profile: m.id,
      p_numero: nuovo,
    });
    if (error) {
      alert(
        error.message.includes("numero_gia_usato")
          ? "Questo numero è già di un altro iscritto."
          : error.message.includes("numero_non_valido")
          ? "Numero non valido. Se non è italiano, mettilo col prefisso (+385…)."
          : error.message,
      );
      return;
    }
    carica();
  }

  async function togliDallaCrew(m: Membro) {
    if (!confirm(`Togliere ${m.alias} dallo staff? Torna nel pubblico, non perde l'account.`)) return;
    setLavorando(m.id);
    await createClient().rpc("admin_set_role", { p_profile: m.id, p_role: "public" });
    setLavorando(null);
    carica();
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-brand-gray text-sm font-mono">caricamento…</p>
      </main>
    );
  }

  // Guarda alias, nome vero, email e numero di tessera. Il numero si
  // può scrivere come viene: 55, #55 o 0055.
  const cercato = cerca.trim().toLowerCase().replace(/^#/, "");
  const corrisponde = (x: {
    alias: string;
    nome: string | null;
    email: string | null;
    member_number: number;
  }) =>
    !cercato ||
    x.alias.toLowerCase().includes(cercato) ||
    (x.nome ?? "").toLowerCase().includes(cercato) ||
    (x.email ?? "").toLowerCase().includes(cercato) ||
    String(x.member_number) === String(Number(cercato)) ||
    String(x.member_number).padStart(4, "0").includes(cercato);
  const candidatureVisibili = candidature.filter(corrisponde);
  const membriVisibili = membri.filter(corrisponde);

  // Da scrivere su WhatsApp: chi della crew non ha ancora avuto il
  // benvenuto. Prima chi ha il numero (i nuovi in cima), poi chi non l'ha
  // ancora messo: glielo chiede il sito quando apre "Le tue prevendite".
  // Senza lo script 41 i campi non arrivano e la sezione non c'è.
  const conNumeri = membri.some((m) => "telefono" in m);
  const daScrivere = membriVisibili
    .filter((m) => conNumeri && !m.whatsapp_scritto_at && m.telefono)
    .sort((a, b) => (b.crew_since ?? "").localeCompare(a.crew_since ?? ""));
  const senzaNumero = membriVisibili.filter((m) => conNumeri && !m.telefono);

  return (
    <main className="flex-1 px-5 py-8 max-w-2xl mx-auto w-full">
      <button
        onClick={() => router.push("/admin/dashboard")}
        className="text-[10px] uppercase tracking-widest text-brand-gray hover:text-white transition-colors mb-6"
      >
        ← Dashboard
      </button>

      <h1 className="font-display text-3xl text-brand-red mb-1">Staff</h1>
      <p className="text-brand-gray text-sm mb-8">
        Chi si è candidato, e chi è già dentro.
      </p>

      {errore && (
        <div className="border border-brand-red/40 bg-brand-red/5 px-4 py-3 mb-6">
          <p className="text-brand-red text-xs leading-relaxed">{errore}</p>
        </div>
      )}

      {/* Appena entrato: la cosa da fare adesso è una sola, il benvenuto. */}
      {appenaEntrato && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-5">
          <div className="w-full max-w-sm border border-emerald-400/50 bg-black px-5 py-6">
            <p className="font-tech text-[10px] uppercase tracking-[0.35em] text-emerald-400">
              è dentro
            </p>
            <p className="mt-2 font-display text-3xl uppercase leading-none text-white">
              {appenaEntrato.chi}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-brand-gray">{appenaEntrato.info}</p>

            {appenaEntrato.telefono ? (
              <>
                <button
                  onClick={() => {
                    const a = appenaEntrato;
                    setAppenaEntrato(null);
                    mandaBenvenuto(a.id, a.telefono!, a.saluto, a.serata);
                  }}
                  className="mt-6 w-full bg-emerald-500 py-4 text-sm font-semibold uppercase tracking-widest text-black"
                >
                  Mandagli il benvenuto su WhatsApp
                </button>
                <p className="mt-2 text-center text-[11px] text-brand-gray">
                  {mostraNumero(appenaEntrato.telefono)} · il messaggio spiega come funziona,
                  lo puoi ritoccare prima di mandarlo
                </p>
              </>
            ) : (
              <p className="mt-6 border border-amber-400/40 bg-amber-400/5 px-4 py-3 text-[11px] leading-relaxed text-white/80">
                Non ha lasciato il numero: si è candidato prima che fosse obbligatorio. Glielo
                chiede il sito appena apre &quot;Le tue prevendite&quot;, e poi lo trovi qui in{" "}
                <span className="text-white">da scrivere su WhatsApp</span>.
              </p>
            )}

            <button
              onClick={() => setAppenaEntrato(null)}
              className="mt-3 w-full border border-white/15 py-3 text-[10px] uppercase tracking-widest text-brand-gray hover:text-white"
            >
              {appenaEntrato.telefono ? "dopo (resta nella lista da scrivere)" : "ok"}
            </button>
          </div>
        </div>
      )}

      {/* Missione 150 */}
      <div className="border border-white/10 px-5 py-4 mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-[10px] uppercase tracking-widest text-brand-gray">Missione 150</p>
          <p className="font-display text-2xl text-white">
            {quantiCrew ?? "—"}
            <span className="text-brand-gray text-base"> / 150</span>
          </p>
        </div>
        <div className="h-[3px] bg-white/8">
          <div
            className="h-full bg-brand-red transition-all duration-700"
            style={{
              width: `${Math.min(100, ((quantiCrew ?? 0) / 150) * 100)}%`,
              boxShadow: "0 0 10px rgba(224,24,31,0.6)",
            }}
          />
        </div>
      </div>

      {/* Cerca */}
      {/* Resta attaccata sotto la barra del pannello mentre scorri. */}
      <div
        className="sticky z-10 -mx-5 mb-8 bg-black px-5 py-2"
        style={{ top: "calc(3.1rem + env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="cerca per nome o numero…"
            className="min-w-0 flex-1 border border-white/15 bg-black px-3 py-3 text-sm text-white placeholder-brand-gray/50 outline-none focus:border-brand-red"
          />
          {cerca && (
            <button
              onClick={() => setCerca("")}
              className="border border-white/10 px-3 py-3 text-[10px] uppercase tracking-widest text-brand-gray hover:text-white"
            >
              pulisci
            </button>
          )}
        </div>
        {cercato && (
          <p className="mt-2 text-[10px] uppercase tracking-widest text-brand-gray/60">
            {membriVisibili.length + candidatureVisibili.length === 0
              ? "nessuno con questo nome o numero"
              : `trovati: ${membriVisibili.length} nello staff` +
                (candidatureVisibili.length ? `, ${candidatureVisibili.length} in attesa` : "")}
          </p>
        )}
      </div>

      {/* Da scrivere su WhatsApp */}
      {conNumeri && (daScrivere.length > 0 || senzaNumero.length > 0) && (
        <div className="mb-10">
          <p className="text-xs uppercase tracking-widest text-emerald-400 mb-1">
            Da scrivere su WhatsApp ({daScrivere.length})
          </p>
          <p className="text-[10px] text-brand-gray/40 uppercase tracking-widest mb-4">
            Il tasto apre la chat col benvenuto già scritto · &quot;già in chat&quot; se gli hai
            già scritto tu
          </p>

          {daScrivere.length === 0 ? (
            <p className="text-brand-gray/50 text-sm py-6 text-center border border-white/5">
              Hai scritto a tutti quelli che hanno lasciato il numero.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {daScrivere.map((m) => (
                <div key={m.id} className="border border-emerald-400/30 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm text-white">
                      {m.nome ?? m.alias}
                      <span className="ml-2 font-mono text-xs text-brand-gray/50">
                        #{String(m.member_number).padStart(4, "0")}
                      </span>
                    </p>
                    <span className="flex-shrink-0 text-[11px] text-brand-gray">
                      {mostraNumero(m.telefono)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-brand-gray/60">
                    {m.alias}
                    {m.serate ? ` · ${m.serate}` : " · nessuna serata agganciata"}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => mandaBenvenuto(m.id, m.telefono!, nomeBreve(m), m.serate ?? null)}
                      className="flex-1 bg-emerald-500 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-black"
                    >
                      Benvenuto su WhatsApp
                    </button>
                    <button
                      onClick={() => segnaScritto(m.id, true)}
                      className="border border-white/15 px-3 py-2.5 text-[10px] uppercase tracking-widest text-brand-gray hover:text-white"
                    >
                      già in chat ✓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {senzaNumero.length > 0 && (
            <div className="mt-3 border border-white/5">
              <button
                onClick={() => setSenzaNumeroAperti((a) => !a)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-[10px] uppercase tracking-widest text-brand-gray hover:text-white"
              >
                <span>Non hanno ancora messo il numero ({senzaNumero.length})</span>
                <span>{senzaNumeroAperti ? "−" : "+"}</span>
              </button>
              {senzaNumeroAperti && (
                <div className="border-t border-white/5 px-4 py-3">
                  <p className="mb-3 text-[11px] leading-relaxed text-brand-gray">
                    Non vendono finché non lo scrivono: glielo chiede il sito appena aprono
                    &quot;Le tue prevendite&quot;. Se te l&apos;hanno dato a voce, mettilo tu.
                  </p>
                  <div className="flex flex-col gap-1">
                    {senzaNumero.map((m) => (
                      <div key={m.id} className="flex items-center justify-between gap-3 py-1">
                        <p className="min-w-0 truncate text-xs text-white">
                          {m.nome ?? m.alias}
                          <span className="ml-2 text-brand-gray/50">{m.alias}</span>
                        </p>
                        <button
                          onClick={() => correggiNumero(m)}
                          className="flex-shrink-0 text-[10px] uppercase tracking-widest text-brand-gray hover:text-white"
                        >
                          metti numero
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Candidature in attesa */}
      <div className="mb-10">
        <p className="text-xs uppercase tracking-widest text-brand-gray mb-1">
          Candidature in attesa ({candidature.length})
        </p>
        <p className="text-[10px] text-brand-gray/40 uppercase tracking-widest mb-4">
          Se lo fai entrare, il sito ti prepara il benvenuto da mandargli su WhatsApp
        </p>

        {candidatureVisibili.length === 0 ? (
          <p className="text-brand-gray/50 text-sm py-8 text-center border border-white/5">
            {cercato && candidature.length > 0
              ? "Nessuna candidatura con questo nome o numero."
              : "Nessuna candidatura da leggere."}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {candidatureVisibili.map((c) => (
              <div key={c.id} className="border border-brand-red/40 bg-brand-red/[0.03]">
                <div className="px-4 py-4">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <p className="text-white text-base">
                      {c.nome ?? c.alias}
                      <span className="text-brand-gray/50 font-mono text-xs ml-2">
                        #{String(c.member_number).padStart(4, "0")}
                      </span>
                    </p>
                    <span className="text-[10px] uppercase tracking-widest text-brand-gray/50 flex-shrink-0">
                      {new Date(c.crew_request_at).toLocaleDateString("it-IT", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-brand-gray mb-1">
                    alias <span className="text-white">{c.alias}</span>
                    {c.gender && ` · ${c.gender}`}
                    {c.invitato_da && ` · portato da ${c.invitato_da}`}
                  </p>
                  {c.email && <p className="text-[11px] text-brand-gray/60 break-all mb-1">{c.email}</p>}
                  {c.telefono ? (
                    <button
                      onClick={() => apriWhatsapp(c.telefono!)}
                      className="mb-4 text-[11px] text-emerald-400 hover:text-emerald-300"
                    >
                      {mostraNumero(c.telefono)} · apri la chat WhatsApp →
                    </button>
                  ) : (
                    <p className="mb-4 text-[11px] text-brand-gray/40">
                      nessun numero: si è candidato prima che fosse obbligatorio
                    </p>
                  )}

                  <Risposte risposte={c.crew_answers} />

                  {serate.length > 0 && (
                    <label className="mt-5 block">
                      <span className="mb-1 block text-[10px] uppercase tracking-widest text-brand-gray">
                        se entra, vende solo per
                      </span>
                      <select
                        value={serataScelta[c.id] ?? serate[0].event_id}
                        onChange={(e) =>
                          setSerataScelta((prec) => ({ ...prec, [c.id]: e.target.value }))
                        }
                        className="w-full border border-white/15 bg-black px-3 py-3 text-sm text-white outline-none focus:border-brand-red"
                      >
                        {serate.map((s) => (
                          <option key={s.event_id} value={s.event_id}>
                            {s.nome} ·{" "}
                            {new Date(s.starts_at).toLocaleDateString("it-IT", {
                              day: "numeric",
                              month: "short",
                            })}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={() => decidi(c, true)}
                      disabled={lavorando === c.id}
                      className="flex-1 text-[10px] uppercase tracking-widest border border-brand-red bg-brand-red text-white py-3 hover:opacity-90 transition-opacity disabled:opacity-40"
                    >
                      {lavorando === c.id ? "…" : "Fallo entrare"}
                    </button>
                    <button
                      onClick={() => decidi(c, false)}
                      disabled={lavorando === c.id}
                      className="text-[10px] uppercase tracking-widest border border-white/10 text-brand-gray px-5 py-3 hover:border-white/30 transition-colors disabled:opacity-40"
                    >
                      Rifiuta
                    </button>
                  </div>
                  <button
                    onClick={() => setChat(chat === c.id ? null : c.id)}
                    className={`mt-2 w-full text-[10px] uppercase tracking-widest border py-3 transition-colors ${
                      chat === c.id
                        ? "border-brand-red text-white"
                        : "border-white/20 text-white hover:border-brand-red"
                    }`}
                  >
                    {chat === c.id ? "chiudi la chat" : "✉ scrivigli per fargli domande"}
                  </button>
                  {chat === c.id && (
                    <ConversazioneDirezione profileId={c.id} chi={c.nome ?? c.alias} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* La crew attuale */}
      <p className="text-xs uppercase tracking-widest text-brand-gray mb-1">
        La crew ({membri.length})
      </p>
      <p className="text-[10px] text-brand-gray/40 uppercase tracking-widest mb-4">
        Tocca un nome per leggere il suo questionario
      </p>

      {membriVisibili.length === 0 ? (
        <p className="text-brand-gray/50 text-sm py-8 text-center border border-white/5">
          {cercato && membri.length > 0
            ? "Nessuno nello staff con questo nome o numero."
            : "Ancora nessuno nello staff."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {membriVisibili.map((m) => {
            const espanso = aperto === m.id;
            return (
              <div key={m.id} className="border border-white/10">
                <button
                  onClick={() => setAperto(espanso ? null : m.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-white text-sm truncate">
                      {m.alias}
                      <span className="text-brand-gray/50 font-mono text-xs ml-2">
                        #{String(m.member_number).padStart(4, "0")}
                      </span>
                    </p>
                    {m.nome && <p className="text-xs text-brand-gray truncate">{m.nome}</p>}
                  </div>
                  <span className="text-brand-gray/40 text-xs flex-shrink-0">
                    {espanso ? "−" : "+"}
                  </span>
                </button>

                {espanso && (
                  <div className="px-4 pb-4 pt-1 border-t border-white/5">
                    {m.email && (
                      <p className="text-[11px] text-brand-gray/60 mb-1 break-all">{m.email}</p>
                    )}
                    {conNumeri && (
                      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                        {m.telefono ? (
                          <button
                            onClick={() => apriWhatsapp(m.telefono!)}
                            className="text-emerald-400 hover:text-emerald-300"
                          >
                            {mostraNumero(m.telefono)} · chat WhatsApp →
                          </button>
                        ) : (
                          <span className="text-brand-gray/50">nessun numero</span>
                        )}
                        <button
                          onClick={() => correggiNumero(m)}
                          className="uppercase tracking-widest text-[10px] text-brand-gray hover:text-white"
                        >
                          {m.telefono ? "correggi" : "metti numero"}
                        </button>
                        {m.whatsapp_scritto_at ? (
                          <button
                            onClick={() => segnaScritto(m.id, false)}
                            title="rimettilo nella lista da scrivere"
                            className="text-brand-gray/50 hover:text-white"
                          >
                            benvenuto mandato il{" "}
                            {new Date(m.whatsapp_scritto_at).toLocaleDateString("it-IT", {
                              day: "numeric",
                              month: "short",
                            })}
                          </button>
                        ) : (
                          m.telefono && <span className="text-amber-300">da scrivere</span>
                        )}
                      </div>
                    )}
                    <Risposte risposte={m.crew_answers} />
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        onClick={() => setChat(chat === m.id ? null : m.id)}
                        className={`text-[10px] uppercase tracking-widest border px-4 py-2 transition-colors ${
                          chat === m.id
                            ? "border-brand-red text-white"
                            : "border-white/20 text-white hover:border-brand-red"
                        }`}
                      >
                        {chat === m.id ? "chiudi la chat" : "✉ scrivi"}
                      </button>
                      <button
                        onClick={() => togliDallaCrew(m)}
                        disabled={lavorando === m.id}
                        className="text-[10px] uppercase tracking-widest border border-white/10 text-brand-gray px-4 py-2 hover:text-brand-red hover:border-brand-red/40 transition-colors disabled:opacity-40"
                      >
                        Togli dallo staff
                      </button>
                    </div>
                    {chat === m.id && (
                      <ConversazioneDirezione profileId={m.id} chi={m.alias} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
