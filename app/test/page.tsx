"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QUIZ_QUESTIONS } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/client";

export default function TestPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!sessionStorage.getItem("reg_draft")) router.replace("/unisciti");
  }, [router]);

  async function handleAnswer(optionId: string) {
    if (selected) return;
    setSelected(optionId);

    await new Promise((r) => setTimeout(r, 500));
    setVisible(false);
    await new Promise((r) => setTimeout(r, 300));

    const question = QUIZ_QUESTIONS[step];
    const newAnswers = { ...answers, [question.id]: optionId };
    setAnswers(newAnswers);

    if (step < QUIZ_QUESTIONS.length - 1) {
      setStep(step + 1);
      setSelected(null);
      setVisible(true);
      return;
    }

    // Ultima risposta — registra
    setLoading(true);
    setError("");
    try {
      const draft = JSON.parse(sessionStorage.getItem("reg_draft") ?? "{}");
      const supabase = createClient();

      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) throw signInError;

      const { data, error: rpcError } = await supabase.rpc("join_one_percent", {
        p_alias: draft.alias,
        p_avatar_id: draft.avatarId,
        p_quiz_answers: newAnswers,
        p_email: draft.email ?? null,
        p_phone: draft.phone ?? null,
        p_referral_code: draft.refCode ?? null,
      });

      if (rpcError) {
        if (rpcError.message?.includes("alias")) {
          setError("Questo alias è già preso. Torna indietro e scegline un altro.");
        } else {
          throw rpcError;
        }
        setLoading(false);
        setSelected(null);
        setVisible(true);
        return;
      }

      sessionStorage.setItem("member_data", JSON.stringify(data));
      sessionStorage.removeItem("reg_draft");
      router.push("/benvenuto");
    } catch (e) {
      setError("Qualcosa è andato storto. Riprova.");
      console.error(e);
      setLoading(false);
      setSelected(null);
      setVisible(true);
    }
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
      <div className="flex h-px">
        {QUIZ_QUESTIONS.map((_, i) => (
          <div
            key={i}
            className="flex-1 transition-colors duration-700"
            style={{ background: i <= step ? "#e0181f" : "rgba(255,255,255,0.08)" }}
          />
        ))}
      </div>

      {/* Numero domanda */}
      <div className="px-6 pt-8 pb-2">
        <p className="text-[10px] uppercase tracking-[0.4em] text-brand-gray/60 font-mono">
          {String(step + 1).padStart(2, "0")} / {String(QUIZ_QUESTIONS.length).padStart(2, "0")}
        </p>
      </div>

      {/* Domanda + opzioni */}
      <div
        className={`flex-1 flex flex-col justify-between px-6 pb-10 transition-all duration-300 ${visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}
      >
        <h2
          className="font-display text-white mt-6"
          style={{ fontSize: "clamp(1.6rem, 7vw, 2.4rem)", lineHeight: 1.15 }}
        >
          {q.text}
        </h2>

        <div className="flex flex-col gap-3 mt-auto">
          {q.options.map((opt, i) => {
            const isSelected = selected === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => handleAnswer(opt.id)}
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
