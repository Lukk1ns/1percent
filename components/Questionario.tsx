"use client";

import { useState } from "react";
import type { QuizQuestion } from "@/lib/quiz";

export type RispostaAperta = { text: string; tag: string };
export type Risposte = Record<string, string | RispostaAperta>;

type Props = {
  /** Le domande da porre, in ordine. */
  questions: QuizQuestion[];
  /** Chiamata con tutte le risposte dopo l'ultima domanda. Se lancia, l'errore va mostrato via `error`. */
  onComplete: (risposte: Risposte) => Promise<void>;
  /** Messaggio d'errore del genitore. Quando compare, il questionario torna interattivo. */
  error?: string;
  /** Cosa scrivere sotto al logo mentre si aspetta il server. */
  loadingLabel?: string;
  /** Nodo extra sotto l'errore (es. un bottone "cambia alias"). */
  errorAction?: React.ReactNode;
};

/**
 * Questionario a schermo pieno, una domanda per volta.
 * Usato sia dal quiz del pubblico che dal questionario della crew:
 * cambiano solo le domande, non l'interfaccia.
 */
export default function Questionario({
  questions,
  onComplete,
  error,
  loadingLabel = "verifica in corso…",
  errorAction,
}: Props) {
  const [step, setStep] = useState(0);
  const [risposte, setRisposte] = useState<Risposte>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [testoLibero, setTestoLibero] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(true);

  function resetStepState() {
    setSelected(null);
    setTestoLibero("");
    setTag(null);
    setVisible(true);
  }

  async function advance(nuove: Risposte) {
    setVisible(false);
    await new Promise((r) => setTimeout(r, 300));

    if (step < questions.length - 1) {
      setRisposte(nuove);
      setStep(step + 1);
      resetStepState();
      return;
    }

    setLoading(true);
    try {
      await onComplete(nuove);
    } finally {
      // Se il genitore ha navigato altrove questo non si vede mai;
      // se invece ha impostato un errore, si torna interattivi.
      setLoading(false);
      resetStepState();
    }
  }

  async function handleScelta(optionId: string) {
    if (selected) return;
    setSelected(optionId);
    await new Promise((r) => setTimeout(r, 500));
    await advance({ ...risposte, [questions[step].id]: optionId });
  }

  async function handleAperta() {
    if (!tag) return;
    await advance({
      ...risposte,
      [questions[step].id]: { text: testoLibero.trim(), tag },
    });
  }

  /** Domanda a solo testo libero: si può anche lasciare vuota. */
  async function handleTesto() {
    await advance({ ...risposte, [questions[step].id]: testoLibero.trim() });
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
          {loadingLabel}
        </p>
      </main>
    );
  }

  const q = questions[step];

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Avanzamento */}
      <div className="flex h-[3px] gap-1 px-1">
        {questions.map((_, i) => (
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

      <div className="px-6 pt-8 pb-2">
        <p className="text-[10px] uppercase tracking-[0.4em] text-brand-gray/60 font-mono">
          {String(step + 1).padStart(2, "0")} / {String(questions.length).padStart(2, "0")}
        </p>
      </div>

      <div
        className={`flex-1 flex flex-col justify-between px-6 pb-10 transition-all duration-300 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
        }`}
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
                  onClick={() => handleScelta(opt.id)}
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
            <textarea
              placeholder={q.placeholder}
              value={testoLibero}
              onChange={(e) => setTestoLibero(e.target.value)}
              maxLength={200}
              rows={2}
              className="w-full bg-transparent border border-white/10 text-sm text-white placeholder-brand-gray/40 px-4 py-3 outline-none focus:border-brand-red/60 transition-colors resize-none"
            />

            <div>
              <p className="text-[10px] uppercase tracking-widest text-brand-gray mb-3">
                In una parola:
              </p>
              <div className="flex flex-wrap gap-2">
                {q.tags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTag(t)}
                    className={`px-4 py-2 text-xs border transition-all ${
                      tag === t
                        ? "border-brand-red bg-brand-red text-white"
                        : "border-white/20 text-white/70 hover:border-brand-red/60"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleAperta}
              disabled={!tag}
              className={`btn w-full ${tag ? "btn-primary" : "btn-ghost"}`}
            >
              Avanti →
            </button>
          </div>
        )}

        {q.type === "text" && (
          <div className="flex flex-col gap-5 mt-auto">
            <textarea
              placeholder={q.placeholder}
              value={testoLibero}
              onChange={(e) => setTestoLibero(e.target.value)}
              maxLength={400}
              rows={5}
              className="w-full bg-transparent border border-white/10 text-sm text-white placeholder-brand-gray/40 px-4 py-3 outline-none focus:border-brand-red/60 transition-colors resize-none"
              autoFocus
            />
            <button
              onClick={handleTesto}
              className={`btn w-full ${testoLibero.trim() ? "btn-primary" : "btn-ghost"}`}
            >
              {testoLibero.trim() ? "Avanti →" : "Salta →"}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-6 text-center">
            <p className="text-brand-red text-sm mb-3">{error}</p>
            {errorAction}
          </div>
        )}
      </div>
    </main>
  );
}
