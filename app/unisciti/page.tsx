"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AVATARS } from "@/lib/avatars";
import { SIGNUPS_OPEN } from "@/lib/event";
import { createClient } from "@/lib/supabase/client";

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
    if (!consent) {
      setAliasError("Devi accettare la privacy policy per continuare.");
      return false;
    }
    return true;
  }

  function handleNext() {
    if (!validate()) return;
    sessionStorage.setItem(
      "reg_draft",
      JSON.stringify({
        alias: alias.trim().toLowerCase(),
        avatarId,
        email: email.trim(),
        gender,
        refCode: refCode || null,
      }),
    );
    router.push("/test");
  }

  if (signupsOpen === null) return null; // controllo in corso, evita flash del form
  if (signupsOpen === false) return <SignupsClosed />;

  return (
    <main className="flex-1 flex flex-col items-center px-6 py-12 max-w-md mx-auto w-full">
      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-2">
        passo 1 di 2
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
        <div className="grid grid-cols-6 gap-2">
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
        className="btn btn-primary w-full"
      >
        Avanti →
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
