"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="font-display text-brand-red text-6xl mb-6">%</div>
        <h2 className="text-white text-xl font-semibold mb-3">Controlla la mail</h2>
        <p className="text-brand-gray text-sm max-w-xs">
          Abbiamo mandato un link a <strong className="text-white">{email}</strong>.
          Clicca il link e sei nella dashboard.
        </p>
        <p className="text-brand-gray/40 text-xs mt-4">Controlla anche spam.</p>
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
          {loading ? "Invio…" : "Mandami il link"}
        </button>
      </form>
      <p className="text-brand-gray/40 text-xs mt-8 max-w-xs text-center">
        Niente password: ti arriva un link via email, clicchi ed entri.
      </p>
    </main>
  );
}
