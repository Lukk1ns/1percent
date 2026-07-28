"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CREW_QUESTIONS } from "@/lib/quiz";
import { registraMembro, type Bozza } from "@/lib/registrazione";
import Questionario, { type Risposte } from "@/components/Questionario";

/**
 * Le 4 domande di chi si candida allo staff.
 *
 * Ci arriva solo chi ha spuntato la casella su /unisciti: chi si iscrive
 * e basta è già dentro senza rispondere a niente. La registrazione si
 * chiude qui, con la candidatura in attesa che un admin decida.
 */
export default function CandidaturaPage() {
  const router = useRouter();
  const [errore, setErrore] = useState("");

  useEffect(() => {
    if (!sessionStorage.getItem("reg_draft")) router.replace("/unisciti");
  }, [router]);

  async function invia(risposte: Risposte) {
    setErrore("");

    const bozza = JSON.parse(sessionStorage.getItem("reg_draft") ?? "{}") as Bozza;
    const esito = await registraMembro(bozza, risposte);

    if (!esito.ok) {
      setErrore(esito.messaggio);
      return;
    }

    sessionStorage.setItem("member_data", JSON.stringify(esito.membro));
    sessionStorage.removeItem("reg_draft");
    router.push("/benvenuto");
  }

  return (
    <Questionario
      questions={CREW_QUESTIONS}
      onComplete={invia}
      error={errore}
      loadingLabel="registriamo la tua candidatura…"
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
