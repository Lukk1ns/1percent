"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QUIZ_QUESTIONS } from "@/lib/quiz";
import { computeArchetype } from "@/lib/archetypes";
import { registraMembro, type Bozza } from "@/lib/registrazione";
import Questionario, { type Risposte } from "@/components/Questionario";

/**
 * Le 4 domande di chi si iscrive.
 *
 * Ci passano tutti, dopo il modulo di /unisciti. Da qui:
 *   · chi si iscrive e basta viene registrato subito
 *   · chi si è candidato allo staff prosegue con le 6 domande della crew
 *
 * Le risposte servono anche a calcolare l'archetipo che finisce sulla card.
 */
export default function DomandePage() {
  const router = useRouter();
  const [errore, setErrore] = useState("");

  useEffect(() => {
    if (!sessionStorage.getItem("reg_draft")) router.replace("/unisciti");
  }, [router]);

  async function invia(risposte: Risposte) {
    setErrore("");

    const bozza = JSON.parse(sessionStorage.getItem("reg_draft") ?? "{}") as Bozza;

    // L'archetipo viaggia dentro le risposte: la card lo legge da lì
    const conArchetipo = {
      ...risposte,
      archetype: computeArchetype({
        q1: typeof risposte.q1 === "string" ? risposte.q1 : risposte.q1?.tag,
        q2: typeof risposte.q2 === "string" ? risposte.q2 : risposte.q2?.tag,
        q3: typeof risposte.q3 === "object" ? risposte.q3 : undefined,
        q4: typeof risposte.q4 === "object" ? risposte.q4 : undefined,
      }),
    };

    // Chi si candida allo staff non è ancora arrivato in fondo
    if (bozza.crewRequest) {
      sessionStorage.setItem("reg_quiz", JSON.stringify(conArchetipo));
      router.push("/candidatura");
      return;
    }

    const esito = await registraMembro(bozza, { pubblico: conArchetipo });
    if (!esito.ok) {
      setErrore(esito.messaggio);
      return;
    }

    sessionStorage.setItem("member_data", JSON.stringify(esito.membro));
    sessionStorage.removeItem("reg_draft");
    sessionStorage.removeItem("reg_quiz");
    router.push("/benvenuto");
  }

  return (
    <Questionario
      questions={QUIZ_QUESTIONS}
      onComplete={invia}
      error={errore}
      loadingLabel="ti stiamo facendo entrare…"
      errorAction={
        errore.includes("alias") || errore.includes("email") ? (
          <button
            onClick={() => router.push("/unisciti")}
            className="text-xs uppercase tracking-widest text-white border border-white/20 px-4 py-2"
          >
            ← Torna indietro
          </button>
        ) : null
      }
    />
  );
}
