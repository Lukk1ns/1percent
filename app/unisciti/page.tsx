"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AVATARS } from "@/lib/avatars";
import { SIGNUPS_OPEN } from "@/lib/event";
import { createClient } from "@/lib/supabase/client";
import { type Bozza } from "@/lib/registrazione";

// Schermata mostrata quando le iscrizioni sono chiuse (interruttore admin)
function SignupsClosed() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-md mx-auto w-full text-center">
      <p className="text-5xl mb-6">🔒</p>
      <h1 className="font-display text-4xl text-brand-red mb-4">
        Iscrizioni chiuse al momento
      </h1>
      <p className="text-brand-gray text-sm leading-relaxed mb-2">
        Il 1% tornerà.
      </p>
      <p className="text-brand-gray text-sm leading-relaxed mb-10">
        Tieni d&apos;occhio la home e i nostri canali.
      </p>
      <Link href="/" className="btn btn-outline">
        ← Torna alla home
      </Link>
      <Link
        href="/login"
        className="mt-6 text-xs uppercase tracking-widest text-brand-gray hover:text-white transition-colors"
      >
        Già dell&apos;1%? Rientra →
      </Link>
    </main>
  );
}

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const refCode = params.get("ref") ?? "";

  // null = sto controllando, true/false = risposta del server
  const [signupsOpen, setSignupsOpen] = useState<boolean | null>(
    SIGNUPS_OPEN ? null : false,
  );
  // Registra il click sul link invito. Serve a distinguere chi l'ha
  // visto da chi si è iscritto davvero: solo il secondo numero conta.
  useEffect(() => {
    if (!refCode) return;
    createClient().rpc("track_referral_click", { p_code: refCode });
  }, [refCode]);

  useEffect(() => {
    if (!SIGNUPS_OPEN) return; // chiuso a codice: mostra sempre la schermata chiusa
    createClient()
      .rpc("signups_open")
      .then(({ data, error }) => {
        // Se la RPC non esiste ancora o dà errore, non blocco nessuno
        setSignupsOpen(error ? true : data !== false);
      });
  }, []);

  const [alias, setAlias] = useState("");
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<"M" | "F" | null>(null);
  const [consent, setConsent] = useState(false);
  const [aliasError, setAliasError] = useState("");

  // Candidatura staff: chi la spunta risponde a 4 domande in più e
  // resta in attesa che un admin decida. Nessuno diventa crew da solo.
  const [vuoleStaff, setVuoleStaff] = useState(false);
  const [nome, setNome] = useState("");
  const [entrando, setEntrando] = useState(false);

  function validate() {
    if (alias.trim().length < 2) {
      setAliasError("Scegli un alias di almeno 2 caratteri.");
      return false;
    }
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(alias.trim())) {
      setAliasError("Solo lettere, numeri, _ e - sono permessi.");
      return false;
    }
    if (!avatarId) {
      setAliasError("Scegli un avatar.");
      return false;
    }
    if (!gender) {
      setAliasError("Seleziona M o F.");
      return false;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setAliasError("Inserisci una email valida — ti serve per rientrare.");
      return false;
    }
    if (vuoleStaff && nome.trim().length < 2) {
      setAliasError("Per candidarti serve il tuo nome vero.");
      return false;
    }
    if (!consent) {
      setAliasError("Devi accettare la privacy policy per continuare.");
      return false;
    }
    return true;
  }

  /**
   * Da qui si va sempre alle 4 domande del pubblico. Chi si è candidato
   * allo staff, dopo quelle, ne trova altre 6; la registrazione si
   * chiude in fondo al percorso, non qui.
   */
  function handleNext() {
    if (!validate()) return;

    const bozza: Bozza = {
      alias: alias.trim().toLowerCase(),
      avatarId,
      email: email.trim(),
      gender,
      refCode: refCode || null,
      crewRequest: vuoleStaff,
      nome: vuoleStaff ? nome.trim() : null,
    };

    sessionStorage.setItem("reg_draft", JSON.stringify(bozza));
    sessionStorage.removeItem("reg_quiz");
    setEntrando(true);
    // Due percorsi separati, non uno dentro l'altro: chi si candida fa le
    // 6 domande sue e basta, chi viene alle serate fa le 4 del pubblico.
    router.push(vuoleStaff ? "/candidatura" : "/domande");
  }

  if (signupsOpen === null) return null; // controllo in corso, evita flash del form
  if (signupsOpen === false) return <SignupsClosed />;

  return (
    <main className="flex-1 flex flex-col items-center px-6 py-12 max-w-md mx-auto w-full">
      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-2">
        {vuoleStaff ? "passo 1 di 3" : "passo 1 di 2"}
      </p>
      <h1 className="font-display text-4xl text-brand-red mb-1">Chi sei?</h1>
      <p className="text-brand-gray text-sm mb-10">
        Nessun nome vero. Solo il tuo alias.
      </p>

      {/* Alias */}
      <div className="w-full mb-8">
        <input
          type="text"
          placeholder="il tuo alias..."
          value={alias}
          maxLength={24}
          onChange={(e) => {
            setAlias(e.target.value);
            setAliasError("");
          }}
          className="input-line text-xl"
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
        />
      </div>

      {/* Avatar picker */}
      <div className="w-full mb-8">
        <p className="text-xs uppercase tracking-widest text-brand-gray mb-4">
          Scegli il tuo simbolo
        </p>
        {/* Sul telefono 4 per riga: bersagli più grossi da toccare */}
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {AVATARS.map((av) => (
            <button
              key={av.id}
              onClick={() => {
                setAvatarId(av.id);
                setAliasError("");
              }}
              className={`aspect-square flex items-center justify-center text-2xl border transition-all duration-200 ${
                avatarId === av.id
                  ? "border-brand-red bg-brand-red/20 scale-110 shadow-[0_0_18px_rgba(224,24,31,0.4)]"
                  : "border-white/10 hover:border-white/30 hover:scale-105 active:scale-95"
              }`}
              style={{ clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))" }}
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
              onClick={() => { setGender(g); setAliasError(""); }}
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

      {/* Email obbligatoria */}
      <div className="w-full mb-8">
        <input
          type="email"
          placeholder="la tua email *"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setAliasError(""); }}
          className="input-line text-sm"
        />
        <p className="text-[10px] text-brand-gray/40 mt-2 uppercase tracking-widest">
          Serve per rientrare dal sito — niente spam
        </p>
      </div>

      {/* Cliente o staff: la scelta si vede, non è una casellina */}
      <div className="w-full mb-8">
        <p className="text-xs uppercase tracking-widest text-brand-gray mb-4">
          Come entri
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => {
              setVuoleStaff(false);
              setAliasError("");
            }}
            className={`flex flex-col items-start gap-1 border px-4 py-4 text-left transition-all ${
              !vuoleStaff
                ? "border-brand-red bg-brand-red/10 shadow-[0_0_24px_rgba(224,24,31,0.18)]"
                : "border-white/10 hover:border-white/30"
            }`}
          >
            <span className="text-xl leading-none" aria-hidden>🍹</span>
            <span className="text-sm font-semibold uppercase tracking-wide text-white">
              Vengo alle serate
            </span>
            <span className="text-[11px] leading-relaxed text-brand-gray">
              Entri, ti diverti e a ogni serata giochi allo stand UNPERCENTO: drink,
              shot e altro, estratti sul momento.
            </span>
          </button>

          <button
            onClick={() => {
              setVuoleStaff(true);
              setAliasError("");
            }}
            className={`flex flex-col items-start gap-1 border px-4 py-4 text-left transition-all ${
              vuoleStaff
                ? "border-brand-red bg-brand-red/10 shadow-[0_0_24px_rgba(224,24,31,0.18)]"
                : "border-white/10 hover:border-white/30"
            }`}
          >
            <span className="text-xl leading-none" aria-hidden>🎤</span>
            <span className="text-sm font-semibold uppercase tracking-wide text-white">
              Voglio collaborare
            </span>
            <span className="text-[11px] leading-relaxed text-brand-gray">
              Se vuoi unirti al nostro gruppo ci sono 6 semplici domande per te.
            </span>
          </button>
        </div>

        {vuoleStaff && (
          <div className="mt-4 border border-brand-red/40 bg-brand-red/5 px-4 py-4">
            <input
              type="text"
              placeholder="il tuo nome vero"
              value={nome}
              maxLength={40}
              onChange={(e) => {
                setNome(e.target.value);
                setAliasError("");
              }}
              className="input-line text-base"
              autoComplete="given-name"
            />
            <p className="text-xs text-brand-gray leading-relaxed mt-3">
              <span className="text-white">Non verrà mai visualizzato sul sito.</span> Lo
              leggiamo solo noi, per sapere con chi stiamo parlando. Per tutti gli altri
              resti{" "}
              <span className="text-brand-red">
                {alias.trim() ? alias.trim().toLowerCase() : "il tuo alias"}
              </span>
              .
            </p>
          </div>
        )}
      </div>

      {/* Consenso privacy */}
      <label className="w-full flex items-start gap-3 mb-8 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            setAliasError("");
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

      {aliasError && (
        <p className="w-full text-brand-red text-sm mb-4">{aliasError}</p>
      )}

      <button
        onClick={handleNext}
        disabled={entrando}
        className="btn btn-primary w-full"
      >
        {entrando ? "Un attimo…" : "Avanti →"}
      </button>
    </main>
  );
}

export default function UniscitiPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}
