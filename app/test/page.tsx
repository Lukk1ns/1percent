"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QUIZ_QUESTIONS } from "@/lib/quiz";
import { computeArchetype } from "@/lib/archetypes";
import { createClient } from "@/lib/supabase/client";

type ChoiceAnswers = Record<string, string>;
type HybridAnswer = { text: string; tag: string };
type AllAnswers = { q1?: string; q2?: string; q3?: HybridAnswer; q4?: HybridAnswer };

export default function TestPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<AllAnswers>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [hybridText, setHybridText] = useState("");
  const [hybridTag, setHybridTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!sessionStorage.getItem("reg_draft")) router.replace("/unisciti");
  }, [router]);

  function resetStepState() {
    setSelected(null);
    setHybridText("");
    setHybridTag(null);
    setVisible(true);
  }

  async function advance(newAnswers: AllAnswers) {
    setVisible(false);
    await new Promise((r) => setTimeout(r, 300));

    if (step < QUIZ_QUESTIONS.length - 1) {
      setAnswers(newAnswers);
      setStep(step + 1);
      resetStepState();
      return;
    }

    // Ultima risposta — registra
    setLoading(true);
    setError("");
    try {
      const draft = JSON.parse(sessionStorage.getItem("reg_draft") ?? "{}");
      const supabase = createClient();

      const archetype = computeArchetype(newAnswers);
      const quizPayload = { ...newAnswers, archetype };

      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) throw signInError;

      const { data, error: rpcError } = await supabase.rpc("join_one_percent", {
        p_alias: draft.alias,
        p_avatar_id: draft.avatarId,
        p_quiz_answers: quizPayload,
        p_email: draft.email ?? null,
        p_gender: draft.gender ?? null,
        p_referral_code: draft.refCode ?? null,
      });

      if (rpcError) {
        if (rpcError.message?.includes("alias")) {
          setError("Questo alias è già preso. Torna indietro e scegline un altro.");
        } else if (rpcError.message?.includes("mail")) {
          setError("Questa email è già dell'1%. Torna alla home e usa \"Rientra\" per accedere al tuo account.");
        } else {
          throw rpcError;
        }
        setLoading(false);
        resetStepState();
        return;
      }

      sessionStorage.setItem("member_data", JSON.stringify(data));
      sessionStorage.removeItem("reg_draft");
      router.push("/benvenuto");
    } catch (e) {
      setError("Qualcosa è andato storto. Riprova.");
      console.error(e);
      setLoading(false);
      resetStepState();
    }
  }

  async function handleChoiceAnswer(optionId: string) {
    if (selected) return;
    setSelected(optionId);
    await new Promise((r) => setTimeout(r, 500));
    const newAnswers = { ...answers, [QUIZ_QUESTIONS[step].id]: optionId } as AllAnswers;
    await advance(newAnswers);
  }

  async function handleHybridSubmit() {
    if (!hybridTag) return;
    const q = QUIZ_QUESTIONS[step];
    const newAnswers = {
      ...answers,
      [q.id]: { text: hybridText.trim(), tag: hybridTag },
    } as AllAnswers;
    await advance(newAnswers);
  }

  if (loading) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p
          className="font-display text-brand-red animate-pulse-glow"
          style={{ fontSize: "clamp(5rem, 25vw, 9rem)" }}
        >
          1%
        </p>
        <p className="mt-4 text-xs uppercase tracking-[0.4em] text-brand-gray font-mono">
          verifica in corso…
        </p>
      </main>
    );
  }

  const q = QUIZ_QUESTIONS[step];

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Progress */}
      <div className="flex h-[3px] gap-1 px-1">
        {QUIZ_QUESTIONS.map((_, i) => (
          <div
            key={i}
            className="flex-1 transition-all duration-700"
            style={{
              background: i <= step ? "#e0181f" : "rgba(255,255,255,0.08)",
              boxShadow: i <= step ? "0 0 10px rgba(224,24,31,0.6)" : "none",
            }}
          />
        ))}
      </div>

      {/* Numero domanda */}
      <div className="px-6 pt-8 pb-2">
        <p className="text-[10px] uppercase tracking-[0.4em] text-brand-gray/60 font-mono">
          {String(step + 1).padStart(2, "0")} / {String(QUIZ_QUESTIONS.length).padStart(2, "0")}
        </p>
      </div>

      <div
        className={`flex-1 flex flex-col justify-between px-6 pb-10 transition-all duration-300 ${visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}
      >
        <h2
          className="font-display text-white mt-6"
          style={{ fontSize: "clamp(1.6rem, 7vw, 2.4rem)", lineHeight: 1.15 }}
        >
          {q.text}
        </h2>

        {q.type === "choice" && (
          <div className="flex flex-col gap-3 mt-auto">
            {q.options.map((opt, i) => {
              const isSelected = selected === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => handleChoiceAnswer(opt.id)}
                  disabled={!!selected}
                  className={`group relative w-full text-left px-5 py-5 text-sm transition-all duration-200 border ${
                    isSelected
                      ? "border-brand-red bg-brand-red text-white scale-[1.02]"
                      : selected
                        ? "border-white/5 text-white/20"
                        : "border-white/10 text-white hover:border-brand-red/60 hover:bg-brand-red/5 active:scale-[0.98]"
                  }`}
                  style={{ animationDelay: `${i * 0.07}s` }}
                >
                  <span className="text-brand-red/40 text-xs font-mono mr-3 group-hover:text-brand-red transition-colors">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {opt.text}
                  {isSelected && (
                    <span className="absolute right-5 top-1/2 -translate-y-1/2 text-white">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {q.type === "hybrid" && (
          <div className="flex flex-col gap-5 mt-auto">
            {/* Testo libero opzionale */}
            <textarea
              placeholder={q.placeholder}
              value={hybridText}
              onChange={(e) => setHybridText(e.target.value)}
              maxLength={120}
              rows={2}
              className="w-full bg-transparent border border-white/10 text-sm text-white placeholder-brand-gray/40 px-4 py-3 outline-none focus:border-brand-red/60 transition-colors resize-none"
            />

            {/* Tag obbligatorio */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-brand-gray mb-3">
                In una parola:
              </p>
              <div className="flex flex-wrap gap-2">
                {q.tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setHybridTag(tag)}
                    className={`px-4 py-2 text-xs border transition-all ${
                      hybridTag === tag
                        ? "border-brand-red bg-brand-red text-white"
                        : "border-white/20 text-white/70 hover:border-brand-red/60"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleHybridSubmit}
              disabled={!hybridTag}
              className={`btn w-full ${hybridTag ? "btn-primary" : "btn-ghost"}`}
            >
              Avanti →
            </button>
          </div>
        )}

        {error && (
          <div className="mt-6 text-center">
            <p className="text-brand-red text-sm mb-3">{error}</p>
            {error.includes("alias") && (
              <button
                onClick={() => router.push("/unisciti")}
                className="text-xs uppercase tracking-widest text-white border border-white/20 px-4 py-2"
              >
                ← Cambia alias
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
