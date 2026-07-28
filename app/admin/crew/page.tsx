"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CREW_QUESTIONS } from "@/lib/quiz";

type Membro = {
  member_number: number;
  alias: string;
  nome: string | null;
  email: string | null;
  crew_since: string | null;
  crew_answers: Record<string, string | { text?: string; tag?: string }> | null;
};

type Invito = {
  code: string;
  note: string | null;
  created_by: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  used_by_alias: string | null;
  used_by_number: number | null;
  stato: "valido" | "usato" | "scaduto" | "revocato";
};

const COLORE_STATO: Record<Invito["stato"], string> = {
  valido: "text-brand-red border-brand-red/40",
  usato: "text-emerald-400 border-emerald-400/30",
  scaduto: "text-brand-gray border-white/10",
  revocato: "text-brand-gray/50 border-white/5",
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
  return null;
}

/**
 * Pannello inviti crew.
 * Nell'1% non ci si candida: ogni membro della crew entra con un
 * codice monouso generato qui e consegnato a mano.
 */
export default function AdminCrewPage() {
  const router = useRouter();
  const [inviti, setInviti] = useState<Invito[]>([]);
  const [membri, setMembri] = useState<Membro[]>([]);
  const [aperto, setAperto] = useState<number | null>(null);
  const [quantiCrew, setQuantiCrew] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [creando, setCreando] = useState(false);
  const [copiato, setCopiato] = useState<string | null>(null);

  async function carica() {
    const supabase = createClient();
    const [invRes, crewRes, membriRes] = await Promise.all([
      supabase.rpc("admin_list_crew_invites"),
      supabase.rpc("crew_count"),
      supabase.rpc("admin_crew_answers"),
    ]);

    if (invRes.error) {
      setErrore(
        "Non disponibile. Hai incollato supabase/02_fondamenta.sql nel SQL Editor? (" +
          invRes.error.message +
          ")",
      );
      setLoading(false);
      return;
    }
    setInviti((invRes.data ?? []) as Invito[]);
    setMembri((membriRes.data ?? []) as Membro[]);
    if (typeof crewRes.data === "number") setQuantiCrew(crewRes.data);
    setErrore(null);
    setLoading(false);
  }

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function creaInvito() {
    setCreando(true);
    const { error } = await createClient().rpc("admin_create_crew_invite", {
      p_note: nota.trim() || null,
    });
    setCreando(false);
    if (error) {
      setErrore(error.message);
      return;
    }
    setNota("");
    carica();
  }

  async function revoca(code: string) {
    if (!confirm(`Annullare l'invito ${code}? Chi ce l'ha non potrà più usarlo.`)) return;
    await createClient().rpc("admin_revoke_crew_invite", { p_code: code });
    carica();
  }

  function copiaLink(code: string) {
    const link = `${window.location.origin}/crew/entra?invito=${code}`;
    navigator.clipboard.writeText(link);
    setCopiato(code);
    setTimeout(() => setCopiato(null), 2000);
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-brand-gray text-sm font-mono">caricamento…</p>
      </main>
    );
  }

  const validi = inviti.filter((i) => i.stato === "valido").length;

  return (
    <main className="flex-1 px-5 py-8 max-w-2xl mx-auto w-full">
      <button
        onClick={() => router.push("/admin/dashboard")}
        className="text-[10px] uppercase tracking-widest text-brand-gray hover:text-white transition-colors mb-6"
      >
        ← Dashboard
      </button>

      <h1 className="font-display text-3xl text-brand-red mb-1">Inviti crew</h1>
      <p className="text-brand-gray text-sm mb-8">
        Un codice, una persona. Si brucia al primo uso.
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
        <p className="text-[10px] text-brand-gray/50 mt-3 uppercase tracking-widest">
          {validi} {validi === 1 ? "invito valido in giro" : "inviti validi in giro"}
        </p>
      </div>

      {/* Nuovo invito */}
      <div className="border border-white/10 px-5 py-5 mb-8">
        <p className="text-xs uppercase tracking-widest text-brand-gray mb-4">Nuovo invito</p>
        <input
          type="text"
          placeholder="per chi è? (es. Marco, il DJ)"
          value={nota}
          maxLength={60}
          onChange={(e) => setNota(e.target.value)}
          className="input-line text-sm mb-5"
        />
        <button onClick={creaInvito} disabled={creando} className="btn btn-primary w-full">
          {creando ? "Genero…" : "Genera codice"}
        </button>
        <p className="text-[10px] text-brand-gray/40 mt-3 uppercase tracking-widest">
          Scade dopo 30 giorni se non viene usato
        </p>
      </div>

      {/* Chi è dentro, e cosa ha risposto */}
      {membri.length > 0 && (
        <div className="mb-10">
          <p className="text-xs uppercase tracking-widest text-brand-gray mb-1">
            La crew ({membri.length})
          </p>
          <p className="text-[10px] text-brand-gray/40 uppercase tracking-widest mb-4">
            Tocca un nome per leggere il suo questionario
          </p>

          <div className="flex flex-col gap-2">
            {membri.map((m) => {
              const espanso = aperto === m.member_number;
              return (
                <div key={m.member_number} className="border border-white/10">
                  <button
                    onClick={() => setAperto(espanso ? null : m.member_number)}
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
                      {!m.crew_answers ? (
                        <p className="text-xs text-brand-gray/50">Nessuna risposta registrata.</p>
                      ) : (
                        <div className="flex flex-col gap-4">
                          {CREW_QUESTIONS.map((q) => {
                            const r = leggiRisposta(q.id, m.crew_answers?.[q.id]);
                            if (!r) return null;
                            return (
                              <div key={q.id}>
                                <p className="text-[10px] uppercase tracking-widest text-brand-gray/50 mb-1">
                                  {r.domanda}
                                </p>
                                <p className="text-sm text-white">{r.risposta}</p>
                                {r.libero && (
                                  <p className="text-sm text-brand-red/90 italic mt-1">
                                    «{r.libero}»
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Elenco */}
      <p className="text-xs uppercase tracking-widest text-brand-gray mb-4">
        Tutti gli inviti ({inviti.length})
      </p>

      {inviti.length === 0 ? (
        <p className="text-brand-gray/50 text-sm py-8 text-center">
          Ancora nessun invito. Genera il primo qui sopra.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {inviti.map((i) => (
            <div key={i.code} className={`border px-4 py-3 ${COLORE_STATO[i.stato]}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-lg tracking-[0.2em] text-white">{i.code}</p>
                  {i.note && <p className="text-xs text-brand-gray truncate">{i.note}</p>}
                </div>
                <span className="text-[10px] uppercase tracking-widest flex-shrink-0">
                  {i.stato}
                </span>
              </div>

              {i.used_at && (
                <p className="text-[11px] text-emerald-400/80 mt-2">
                  usato da {i.used_by_alias} #{i.used_by_number} ·{" "}
                  {new Date(i.used_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                </p>
              )}

              {i.stato === "valido" && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => copiaLink(i.code)}
                    className="flex-1 text-[10px] uppercase tracking-widest border border-white/20 text-white py-2 hover:border-brand-red transition-colors"
                  >
                    {copiato === i.code ? "✓ Copiato" : "Copia link"}
                  </button>
                  <button
                    onClick={() => revoca(i.code)}
                    className="text-[10px] uppercase tracking-widest border border-white/10 text-brand-gray px-4 py-2 hover:text-brand-red hover:border-brand-red/40 transition-colors"
                  >
                    Annulla
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
