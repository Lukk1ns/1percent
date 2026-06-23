"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QUIZ_QUESTIONS } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/client";

export default function TestPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionStorage.getItem("reg_draft")) router.replace("/unisciti");
  }, [router]);

  async function handleAnswer(optionId: string) {
    const question = QUIZ_QUESTIONS[step];
    const newAnswers = { ...answers, [question.id]: optionId };
    setAnswers(newAnswers);

    if (step < QUIZ_QUESTIONS.length - 1) {
      setStep(step + 1);
      return;
    }

    // Ultima risposta: registra l'utente
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
        return;
      }

      sessionStorage.setItem("member_data", JSON.stringify(data));
      sessionStorage.removeItem("reg_draft");
      router.push("/benvenuto");
    } catch (e) {
      setError("Qualcosa è andato storto. Riprova.");
      console.error(e);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="font-display text-brand-red text-6xl animate-pulse-glow">%</div>
        <p className="text-brand-gray text-sm mt-4 uppercase tracking-widest">
          Verifica in corso…
        </p>
      </main>
    );
  }

  const q = QUIZ_QUESTIONS[step];

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 max-w-md mx-auto w-full">
      {/* Progress bar */}
      <div className="w-full flex gap-1 mb-12">
        {QUIZ_QUESTIONS.map((_, i) => (
          <div
            key={i}
            className={`h-0.5 flex-1 transition-colors duration-500 ${
              i <= step ? "bg-brand-red" : "bg-white/10"
            }`}
          />
        ))}
      </div>

      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-4">
        domanda {step + 1} di {QUIZ_QUESTIONS.length}
      </p>

      <h2
        key={q.id}
        className="text-2xl font-semibold text-center mb-10 animate-fade-up"
      >
        {q.text}
      </h2>

      <div className="w-full flex flex-col gap-3">
        {q.options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => handleAnswer(opt.id)}
            className="w-full text-left border border-white/10 px-5 py-4 text-sm hover:border-brand-red hover:bg-brand-red/5 transition-all active:scale-95"
          >
            {opt.text}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-6 w-full text-center">
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
    </main>
  );
}
