"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CREW_QUESTIONS } from "@/lib/quiz";

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
};

type Membro = {
  id: string;
  member_number: number;
  alias: string;
  nome: string | null;
  email: string | null;
  crew_since: string | null;
  crew_answers: RisposteCrew;
};

/** Traduce una risposta grezza nel testo leggibile della domanda corrispondente. */
function leggiRisposta(
  questionId: string,
  valore: string | { text?: string; tag?: string } | undefined,
): { domanda: string; risposta: string; libero?: string } | null {
  const q = CREW_QUESTIONS.find((x) => x.id === questionId);
  if (!q || valore === undefined) return null;

  if (q.type === "choice" && typeof valore === "string") {
    return { domanda: q.text, risposta: q.options.find((o) => o.id === valore)?.text ?? valore };
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

/** Le 4 risposte al questionario, in chiaro. */
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

  async function carica() {
    const supabase = createClient();
    const [reqRes, crewRes, membriRes] = await Promise.all([
      supabase.rpc("admin_crew_requests"),
      supabase.rpc("crew_count"),
      supabase.rpc("admin_crew_answers"),
    ]);

    if (reqRes.error) {
      setErrore(
        "Non disponibile. Hai incollato supabase/02_fondamenta.sql nel SQL Editor? (" +
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
    const verbo = approva ? "Far entrare" : "Rifiutare";
    if (!confirm(`${verbo} ${c.nome ?? c.alias} (${c.alias})?`)) return;

    setLavorando(c.id);
    const { error } = await createClient().rpc(
      approva ? "admin_approve_crew" : "admin_reject_crew",
      { p_profile: c.id },
    );
    setLavorando(null);
    if (error) {
      setErrore(error.message);
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

      {/* Candidature in attesa */}
      <div className="mb-10">
        <p className="text-xs uppercase tracking-widest text-brand-gray mb-1">
          Candidature in attesa ({candidature.length})
        </p>
        <p className="text-[10px] text-brand-gray/40 uppercase tracking-widest mb-4">
          Nessuno viene avvisato in automatico — a chi ti interessa scrivi tu
        </p>

        {candidature.length === 0 ? (
          <p className="text-brand-gray/50 text-sm py-8 text-center border border-white/5">
            Nessuna candidatura da leggere.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {candidature.map((c) => (
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
                  {c.email && <p className="text-[11px] text-brand-gray/60 break-all mb-4">{c.email}</p>}

                  <Risposte risposte={c.crew_answers} />

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

      {membri.length === 0 ? (
        <p className="text-brand-gray/50 text-sm py-8 text-center border border-white/5">
          Ancora nessuno nello staff.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {membri.map((m) => {
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
                      <p className="text-[11px] text-brand-gray/60 mb-4 break-all">{m.email}</p>
                    )}
                    <Risposte risposte={m.crew_answers} />
                    <button
                      onClick={() => togliDallaCrew(m)}
                      disabled={lavorando === m.id}
                      className="mt-5 text-[10px] uppercase tracking-widest border border-white/10 text-brand-gray px-4 py-2 hover:text-brand-red hover:border-brand-red/40 transition-colors disabled:opacity-40"
                    >
                      Togli dallo staff
                    </button>
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
