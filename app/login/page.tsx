"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) {
      setError("Qualcosa è andato storto. Riprova.");
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="font-display text-brand-red text-6xl mb-6">%</div>
        <h2 className="text-white text-xl font-semibold mb-3">Controlla la mail</h2>
        <p className="text-brand-gray text-sm max-w-xs">
          Abbiamo mandato un link a <strong className="text-white">{email}</strong>.
          Clicca il link e sei dentro.
        </p>
        <p className="text-brand-gray/40 text-xs mt-4">Controlla anche spam.</p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6">
      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-2">rientra</p>
      <h1 className="font-display text-brand-red text-5xl mb-2">1%</h1>
      <p className="text-brand-gray text-sm mb-10">Inserisci la tua email. Ti mandiamo un link.</p>

      <form onSubmit={handleSend} className="w-full max-w-xs flex flex-col gap-4">
        <input
          type="email"
          placeholder="la tua email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          className="bg-transparent border-b-2 border-white/20 text-white placeholder-brand-gray/50 pb-2 outline-none focus:border-brand-red transition-colors text-sm"
        />
        {error && <p className="text-brand-red text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 bg-brand-red py-4 text-sm font-semibold uppercase tracking-widest text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {loading ? "Invio…" : "Mandami il link"}
        </button>
      </form>

      <button
        onClick={() => router.push("/unisciti")}
        className="mt-8 text-xs uppercase tracking-widest text-brand-gray/40 hover:text-brand-gray transition-colors"
      >
        Non hai ancora un profilo? Registrati →
      </button>
    </main>
  );
}
