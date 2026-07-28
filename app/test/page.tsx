"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QUIZ_QUESTIONS } from "@/lib/quiz";
import { computeArchetype } from "@/lib/archetypes";
import { createClient } from "@/lib/supabase/client";
import Questionario, { type Risposte } from "@/components/Questionario";

/**
 * Quiz del PUBBLICO — secondo e ultimo passo della registrazione
 * tramite il link invito di un membro della crew.
 * L'interfaccia è condivisa con il questionario crew (/crew/entra).
 */
export default function TestPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionStorage.getItem("reg_draft")) router.replace("/unisciti");
  }, [router]);

  async function registra(risposte: Risposte) {
    setError("");
    try {
      const draft = JSON.parse(sessionStorage.getItem("reg_draft") ?? "{}");
      const supabase = createClient();

      // Le risposte arrivano generiche dal questionario: qui le rileggo
      // nella forma che si aspetta il calcolo dell'archetipo.
      const archetype = computeArchetype({
        q1: typeof risposte.q1 === "string" ? risposte.q1 : undefined,
        q2: typeof risposte.q2 === "string" ? risposte.q2 : undefined,
        q3: typeof risposte.q3 === "object" ? risposte.q3 : undefined,
        q4: typeof risposte.q4 === "object" ? risposte.q4 : undefined,
      });
      const quizPayload = { ...risposte, archetype };

      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) throw signInError;

      const { data, error: rpcError } = await supabase.rpc("join_public", {
        p_alias: draft.alias,
        p_avatar_id: draft.avatarId,
        p_nome: null,
        p_email: draft.email ?? null,
        p_gender: draft.gender ?? null,
        p_quiz_answers: quizPayload,
        p_referral_code: draft.refCode ?? null,
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

  return (
    <Questionario
      questions={QUIZ_QUESTIONS}
      onComplete={registra}
      error={error}
      errorAction={
        error.includes("alias") ? (
          <button
            onClick={() => router.push("/unisciti")}
            className="text-xs uppercase tracking-widest text-white border border-white/20 px-4 py-2"
          >
            ← Cambia alias
          </button>
        ) : null
      }
    />
  );
}
