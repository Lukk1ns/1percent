"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QUIZ_QUESTIONS, CREW_QUESTIONS } from "@/lib/quiz";
import { computeArchetype } from "@/lib/archetypes";
import { createClient } from "@/lib/supabase/client";
import Questionario, { type Risposte } from "@/components/Questionario";

/**
 * Secondo passo della registrazione.
 *
 * Tutti rispondono al quiz del pubblico (4 domande, dà l'archetipo
 * sulla card). Chi ha spuntato "voglio entrare nello staff" prosegue
 * con altre 4 domande dedicate, e la sua candidatura resta in attesa
 * finché un admin non decide.
 */
export default function TestPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [fase, setFase] = useState<"quiz" | "staff">("quiz");
  const [risposteQuiz, setRisposteQuiz] = useState<Risposte | null>(null);

  useEffect(() => {
    if (!sessionStorage.getItem("reg_draft")) router.replace("/unisciti");
  }, [router]);

  function leggiBozza() {
    return JSON.parse(sessionStorage.getItem("reg_draft") ?? "{}");
  }

  /** Chiude la registrazione. `crew` è null per chi non si candida. */
  async function registra(quiz: Risposte, crew: Risposte | null) {
    setError("");
    try {
      const draft = leggiBozza();
      const supabase = createClient();

      // Le risposte arrivano generiche dal questionario: qui le rileggo
      // nella forma che si aspetta il calcolo dell'archetipo.
      const archetype = computeArchetype({
        q1: typeof quiz.q1 === "string" ? quiz.q1 : undefined,
        q2: typeof quiz.q2 === "string" ? quiz.q2 : undefined,
        q3: typeof quiz.q3 === "object" ? quiz.q3 : undefined,
        q4: typeof quiz.q4 === "object" ? quiz.q4 : undefined,
      });

      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) throw signInError;

      const { data, error: rpcError } = await supabase.rpc("join_public", {
        p_alias: draft.alias,
        p_avatar_id: draft.avatarId,
        p_nome: draft.nome ?? null,
        p_email: draft.email ?? null,
        p_gender: draft.gender ?? null,
        p_quiz_answers: { ...quiz, archetype },
        p_referral_code: draft.refCode ?? null,
        p_crew_request: !!draft.crewRequest,
        p_crew_answers: crew,
      });

      if (rpcError) {
        if (rpcError.message?.includes("iscrizioni_chiuse")) {
          setError("Le iscrizioni sono chiuse. Riaprono per il prossimo evento.");
        } else if (rpcError.message?.includes("alias")) {
          setError("Questo alias è già preso. Torna indietro e scegline un altro.");
        } else if (rpcError.message?.toLowerCase().includes("mail")) {
          setError(
            'Questa email è già dell\'1%. Torna alla home e usa "Rientra" per accedere al tuo account.',
          );
        } else {
          throw rpcError;
        }
        return;
      }

      sessionStorage.setItem("member_data", JSON.stringify(data));
      sessionStorage.removeItem("reg_draft");
      router.push("/benvenuto");
    } catch (e) {
      console.error(e);
      setError("Qualcosa è andato storto. Riprova.");
    }
  }

  const azioneErrore = error.includes("alias") ? (
    <button
      onClick={() => router.push("/unisciti")}
      className="text-xs uppercase tracking-widest text-white border border-white/20 px-4 py-2"
    >
      ← Cambia alias
    </button>
  ) : null;

  // Seconda tranche: solo per chi si è candidato allo staff
  if (fase === "staff") {
    return (
      <Questionario
        questions={CREW_QUESTIONS}
        onComplete={(crew) => registra(risposteQuiz ?? {}, crew)}
        error={error}
        loadingLabel="registriamo la tua candidatura…"
        errorAction={azioneErrore}
      />
    );
  }

  return (
    <Questionario
      questions={QUIZ_QUESTIONS}
      onComplete={async (quiz) => {
        if (leggiBozza().crewRequest) {
          setRisposteQuiz(quiz);
          setFase("staff");
          return;
        }
        await registra(quiz, null);
      }}
      error={error}
      errorAction={azioneErrore}
    />
  );
}
