"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AVATARS } from "@/lib/avatars";
import { CREW_QUESTIONS } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/client";
import Questionario, { type Risposte } from "@/components/Questionario";

type Fase = "codice" | "dati" | "questionario";

const MOTIVI: Record<string, string> = {
  inesistente: "Questo codice non esiste.",
  revocato: "Questo invito è stato annullato.",
  gia_usato: "Questo invito è già stato usato.",
  scaduto: "Questo invito è scaduto. Chiedi che te ne facciano un altro.",
};

function IngressoCrew() {
  const router = useRouter();
  const params = useSearchParams();

  const [fase, setFase] = useState<Fase>("codice");
  const [codice, setCodice] = useState("");
  const [verifica, setVerifica] = useState(false);
  const [errore, setErrore] = useState("");

  // Dati del membro
  const [nome, setNome] = useState("");
  const [alias, setAlias] = useState("");
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<"M" | "F" | null>(null);
  const [consenso, setConsenso] = useState(false);

  // Codice nel link: lo verifico da solo, senza far digitare niente
  useEffect(() => {
    const dalLink = params.get("invito");
    if (dalLink) {
      setCodice(dalLink.toUpperCase());
      verificaCodice(dalLink.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verificaCodice(code: string) {
    setVerifica(true);
    setErrore("");
    const { data, error } = await createClient().rpc("check_crew_invite", { p_code: code });
    setVerifica(false);

    if (error) {
      setErrore("Non riesco a verificare il codice. Riprova tra un attimo.");
      return;
    }
    if (!data?.ok) {
      setErrore(MOTIVI[data?.reason as string] ?? "Codice non valido.");
      return;
    }
    setFase("dati");
  }

  function validaDati() {
    if (nome.trim().length < 2) return setErrore("Serve il tuo nome vero — lo vede solo lo staff."), false;
    if (alias.trim().length < 2) return setErrore("Scegli un alias di almeno 2 caratteri."), false;
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(alias.trim())) return setErrore("Nell'alias solo lettere, numeri, _ e -."), false;
    if (!avatarId) return setErrore("Scegli il tuo simbolo."), false;
    if (!gender) return setErrore("Seleziona M o F."), false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErrore("Inserisci una email valida."), false;
    if (!consenso) return setErrore("Devi accettare la privacy policy."), false;
    setErrore("");
    return true;
  }

  async function registra(risposte: Risposte) {
    setErrore("");
    try {
      const supabase = createClient();

      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) throw signInError;

      const { data, error } = await supabase.rpc("join_crew", {
        p_alias: alias.trim().toLowerCase(),
        p_avatar_id: avatarId,
        p_nome: nome.trim(),
        p_email: email.trim(),
        p_gender: gender,
        p_crew_answers: risposte,
        p_invite_code: codice,
      });

      if (error) {
        const m = error.message ?? "";
        if (m.includes("Invito")) setErrore(m + " Chiedi un codice nuovo.");
        else if (m.toLowerCase().includes("mail")) setErrore('Questa email è già registrata. Usa "Rientra" dalla home.');
        else if (m.includes("alias")) setErrore("Questo alias è già preso. Torna indietro e cambialo.");
        else throw error;
        return;
      }

      sessionStorage.setItem("member_data", JSON.stringify(data));
      router.push("/benvenuto");
    } catch (e) {
      console.error(e);
      setErrore("Qualcosa è andato storto. Riprova.");
    }
  }

  // ----------------------------------------------------------
  // Fase 3 — le 4 domande della crew
  // ----------------------------------------------------------
  if (fase === "questionario") {
    return (
      <Questionario
        questions={CREW_QUESTIONS}
        onComplete={registra}
        error={errore}
        loadingLabel="ti stiamo mettendo dentro…"
        errorAction={
          errore.includes("alias") ? (
            <button
              onClick={() => setFase("dati")}
              className="text-xs uppercase tracking-widest text-white border border-white/20 px-4 py-2"
            >
              ← Cambia alias
            </button>
          ) : null
        }
      />
    );
  }

  // ----------------------------------------------------------
  // Fase 1 — il codice invito
  // ----------------------------------------------------------
  if (fase === "codice") {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-md mx-auto w-full text-center">
        <p className="text-[10px] uppercase tracking-[0.4em] text-brand-gray/60 font-mono mb-6">
          accesso riservato
        </p>
        <h1 className="font-display text-4xl text-brand-red mb-3">Non ti candidi.</h1>
        <p className="text-brand-gray text-sm leading-relaxed mb-10">
          Nell&apos;1% ci vieni chiamato.
          <br />
          Se hai un codice, è il momento.
        </p>

        <input
          type="text"
          placeholder="CODICE INVITO"
          value={codice}
          maxLength={12}
          onChange={(e) => {
            setCodice(e.target.value.toUpperCase());
            setErrore("");
          }}
          className="input-line text-2xl text-center font-mono tracking-[0.3em] mb-6"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
        />

        {errore && <p className="text-brand-red text-sm mb-4">{errore}</p>}

        <button
          onClick={() => verificaCodice(codice.trim())}
          disabled={codice.trim().length < 4 || verifica}
          className={`btn w-full ${codice.trim().length < 4 ? "btn-ghost" : "btn-primary"}`}
        >
          {verifica ? "Verifica…" : "Entra →"}
        </button>

        <Link
          href="/"
          className="mt-8 text-xs uppercase tracking-widest text-brand-gray hover:text-white transition-colors"
        >
          ← Torna alla home
        </Link>
      </main>
    );
  }

  // ----------------------------------------------------------
  // Fase 2 — chi sei (per la crew il nome vero serve)
  // ----------------------------------------------------------
  return (
    <main className="flex-1 flex flex-col items-center px-6 py-12 max-w-md mx-auto w-full">
      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-2">passo 1 di 2</p>
      <h1 className="font-display text-4xl text-brand-red mb-1">Sei dentro.</h1>
      <p className="text-brand-gray text-sm mb-10">Ora dicci chi sei davvero.</p>

      {/* Nome vero — differenza sostanziale dal pubblico */}
      <div className="w-full mb-8">
        <input
          type="text"
          placeholder="il tuo nome"
          value={nome}
          maxLength={40}
          onChange={(e) => {
            setNome(e.target.value);
            setErrore("");
          }}
          className="input-line text-xl"
          autoFocus
          autoComplete="given-name"
        />
        <p className="text-[10px] text-brand-gray/40 mt-2 uppercase tracking-widest">
          Lo vede solo lo staff — serve per pagamenti e turni
        </p>
      </div>

      {/* Alias pubblico */}
      <div className="w-full mb-8">
        <input
          type="text"
          placeholder="il tuo alias"
          value={alias}
          maxLength={24}
          onChange={(e) => {
            setAlias(e.target.value);
            setErrore("");
          }}
          className="input-line text-xl"
          autoComplete="off"
          autoCapitalize="none"
        />
        <p className="text-[10px] text-brand-gray/40 mt-2 uppercase tracking-widest">
          Questo è il nome che vedono tutti
        </p>
      </div>

      {/* Simbolo */}
      <div className="w-full mb-8">
        <p className="text-xs uppercase tracking-widest text-brand-gray mb-4">Scegli il tuo simbolo</p>
        <div className="grid grid-cols-6 gap-2">
          {AVATARS.map((av) => (
            <button
              key={av.id}
              onClick={() => {
                setAvatarId(av.id);
                setErrore("");
              }}
              className={`aspect-square flex items-center justify-center text-2xl border transition-all duration-200 ${
                avatarId === av.id
                  ? "border-brand-red bg-brand-red/20 scale-110 shadow-[0_0_18px_rgba(224,24,31,0.4)]"
                  : "border-white/10 hover:border-white/30 hover:scale-105 active:scale-95"
              }`}
              style={{
                clipPath:
                  "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
              }}
              aria-label={av.label}
              title={av.label}
            >
              {av.emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Genere */}
      <div className="w-full mb-8">
        <p className="text-xs uppercase tracking-widest text-brand-gray mb-4">Sei</p>
        <div className="flex gap-3">
          {(["M", "F"] as const).map((g) => (
            <button
              key={g}
              onClick={() => {
                setGender(g);
                setErrore("");
              }}
              className={`flex-1 py-4 text-sm font-semibold uppercase tracking-widest border transition-all ${
                gender === g
                  ? "border-brand-red bg-brand-red text-white"
                  : "border-white/10 text-brand-gray hover:border-brand-red/60"
              }`}
            >
              {g === "M" ? "Maschio" : "Femmina"}
            </button>
          ))}
        </div>
      </div>

      {/* Email */}
      <div className="w-full mb-8">
        <input
          type="email"
          placeholder="la tua email *"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrore("");
          }}
          className="input-line text-sm"
          autoCapitalize="none"
        />
        <p className="text-[10px] text-brand-gray/40 mt-2 uppercase tracking-widest">
          Serve per rientrare — niente spam
        </p>
      </div>

      {/* Consenso */}
      <label className="w-full flex items-start gap-3 mb-8 cursor-pointer">
        <input
          type="checkbox"
          checked={consenso}
          onChange={(e) => {
            setConsenso(e.target.checked);
            setErrore("");
          }}
          className="mt-1 accent-brand-red w-4 h-4 flex-shrink-0"
        />
        <span className="text-xs text-brand-gray leading-relaxed">
          Ho letto e accetto la{" "}
          <a href="/privacy" target="_blank" className="text-brand-red underline">
            privacy policy
          </a>
          . So che i miei dati possono essere cancellati in qualsiasi momento.
        </span>
      </label>

      {errore && <p className="w-full text-brand-red text-sm mb-4">{errore}</p>}

      <button
        onClick={() => {
          if (validaDati()) setFase("questionario");
        }}
        className="btn btn-primary w-full"
      >
        Avanti →
      </button>
    </main>
  );
}

export default function CrewEntraPage() {
  return (
    <Suspense>
      <IngressoCrew />
    </Suspense>
  );
}
