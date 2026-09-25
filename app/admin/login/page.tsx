"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Accesso staff.
 *
 * Come su /login c'è anche il codice a 6 cifre: chi tiene il sito sulla
 * schermata Home del telefono ha una finestra con i suoi cookie, e il
 * link della mail — che apre il browser — lascia l'app scollegata.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [codice, setCodice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    const token = codice.replace(/\D/g, "");
    if (token.length < 6) {
      setError("Il codice è di 6 cifre.");
      return;
    }
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    setLoading(false);
    if (err) {
      const msg = err.message?.toLowerCase() ?? "";
      setError(
        msg.includes("expired")
          ? "Il codice è scaduto: fattene mandare un altro."
          : "Codice sbagliato. Controlla le cifre.",
      );
      return;
    }
    router.replace("/admin/dashboard");
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Solo account già esistenti (lo staff): niente creazione da qui.
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/admin/dashboard`,
      },
    });
    if (err) {
      const msg = err.message?.toLowerCase() ?? "";
      if (msg.includes("rate") || msg.includes("limit") || err.status === 429) {
        setError("Troppe richieste. Aspetta qualche minuto e riprova.");
      } else if (msg.includes("signups") || msg.includes("not allowed") || msg.includes("not found")) {
        setError("Questa email non è tra lo staff autorizzato.");
      } else {
        setError(err.message || "Qualcosa è andato storto. Riprova.");
      }
      setLoading(false);
    } else {
      setSent(true);
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="font-display text-brand-red text-6xl mb-6 text-center">%</div>
        <h2 className="text-white text-xl font-semibold mb-3 text-center">Controlla la mail</h2>
        <p className="text-brand-gray text-sm max-w-xs text-center">
          Mandata a <strong className="text-white">{email}</strong>: dentro c&apos;è un codice di
          6 cifre e un link. Dall&apos;app sulla schermata Home funziona solo il codice.
        </p>

        <form onSubmit={handleCode} className="w-full max-w-xs flex flex-col gap-4 mt-8">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="il codice · 6 cifre"
            value={codice}
            onChange={(e) => setCodice(e.target.value)}
            autoFocus
            className="bg-transparent border-b border-white/20 text-center text-2xl tracking-[0.4em] text-white placeholder-brand-gray/40 pb-2 outline-none focus:border-brand-red transition-colors"
          />
          {error && <p className="text-brand-red text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-brand-red py-4 text-sm font-semibold uppercase tracking-widest text-white disabled:opacity-50"
          >
            {loading ? "Entro…" : "Entra"}
          </button>
        </form>

        <p className="text-brand-gray/40 text-xs mt-6 text-center">Controlla anche spam.</p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6">
      <h1 className="font-display text-brand-red text-4xl mb-2">Staff</h1>
      <p className="text-brand-gray text-xs uppercase tracking-widest mb-10">
        accesso riservato
      </p>
      <form onSubmit={handleSend} className="w-full max-w-xs flex flex-col gap-4">
        <input
          type="email"
          placeholder="email staff"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          className="bg-transparent border-b border-white/20 text-white placeholder-brand-gray/50 pb-2 outline-none focus:border-brand-red transition-colors text-sm"
        />
        {error && <p className="text-brand-red text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 bg-brand-red py-4 text-sm font-semibold uppercase tracking-widest text-white disabled:opacity-50"
        >
          {loading ? "Invio…" : "Mandami il codice"}
        </button>
      </form>
      <p className="text-brand-gray/40 text-xs mt-8 max-w-xs text-center">
        Niente password: arriva una mail con un codice e un link. Dentro l'app usa il codice.
      </p>
    </main>
  );
}
