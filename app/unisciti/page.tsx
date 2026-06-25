"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AVATARS } from "@/lib/avatars";

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const refCode = params.get("ref") ?? "";

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
          className="w-full bg-transparent border-b-2 border-brand-gray text-xl text-white placeholder-brand-gray/50 pb-2 outline-none focus:border-brand-red transition-colors"
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
              className={`aspect-square flex items-center justify-center text-2xl border transition-all ${
                avatarId === av.id
                  ? "border-brand-red bg-brand-red/20 scale-110"
                  : "border-white/10 hover:border-white/30"
              }`}
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
          className="w-full bg-transparent border-b-2 border-white/20 text-sm text-white placeholder-brand-gray/50 pb-2 outline-none focus:border-brand-red transition-colors"
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
        className="w-full bg-brand-red py-4 text-sm font-semibold uppercase tracking-widest text-white transition-transform hover:scale-[1.02] active:scale-95"
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
