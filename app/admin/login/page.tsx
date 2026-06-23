"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError("Credenziali non valide.");
      setLoading(false);
    } else {
      router.push("/admin/scan");
    }
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6">
      <h1 className="font-display text-brand-red text-4xl mb-2">Staff</h1>
      <p className="text-brand-gray text-xs uppercase tracking-widest mb-10">
        accesso riservato
      </p>
      <form onSubmit={handleLogin} className="w-full max-w-xs flex flex-col gap-4">
        <input
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="bg-transparent border-b border-white/20 text-white placeholder-brand-gray/50 pb-2 outline-none focus:border-brand-red transition-colors text-sm"
        />
        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="bg-transparent border-b border-white/20 text-white placeholder-brand-gray/50 pb-2 outline-none focus:border-brand-red transition-colors text-sm"
        />
        {error && <p className="text-brand-red text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 bg-brand-red py-4 text-sm font-semibold uppercase tracking-widest text-white disabled:opacity-50"
        >
          {loading ? "Accesso…" : "Entra"}
        </button>
      </form>
    </main>
  );
}
