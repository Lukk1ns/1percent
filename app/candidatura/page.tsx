"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CREW_QUESTIONS, domandaFesta, type QuizQuestion } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/client";
import { registraMembro, type Bozza } from "@/lib/registrazione";
import Questionario, { type Risposte } from "@/components/Questionario";

/**
 * Le 7 domande di chi si candida allo staff. L'ultima ("per quale festa")
 * ha come scelte le feste in programma, lette dal database, più la riga
 * per scriverne un'altra.
 *
 * Ci arriva chi ha scelto "Iscrizione come staff" su /unisciti, e fa solo
 * queste: le 4 del pubblico non gliele chiediamo, gli interessa altro.
 * La registrazione si chiude qui, con la candidatura in attesa che un
 * admin decida. Niente archetipo, perché nasce dal quiz del pubblico.
 */
export default function CandidaturaPage() {
  const router = useRouter();
  const [errore, setErrore] = useState("");
  // Finché le feste non arrivano (o se il database non risponde) la c7
  // resta di solo testo: si scrive e si va avanti lo stesso.
  const [domande, setDomande] = useState<QuizQuestion[]>(CREW_QUESTIONS);

  useEffect(() => {
    createClient()
      .rpc("events_list")
      .then(({ data, error }) => {
        if (error || !Array.isArray(data)) return;
        setDomande(CREW_QUESTIONS.map((q) => (q.id === "c7" ? domandaFesta(q, data) : q)));
      });
  }, []);

  useEffect(() => {
    if (!sessionStorage.getItem("reg_draft")) router.replace("/unisciti");
  }, [router]);

  async function invia(risposte: Risposte) {
    setErrore("");

    const bozza = JSON.parse(sessionStorage.getItem("reg_draft") ?? "{}") as Bozza;
    const pubblico = JSON.parse(sessionStorage.getItem("reg_quiz") ?? "null");
    const esito = await registraMembro(bozza, { pubblico, staff: risposte });

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
      questions={domande}
      onComplete={invia}
      error={errore}
      loadingLabel="registriamo la tua candidatura…"
      errorAction={
        errore.includes("alias") || errore.includes("email") || errore.includes("numero") ? (
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
