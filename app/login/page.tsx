"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Rientro.
 *
 * Due strade per la stessa mail: il **link** e il **codice a 6 cifre**.
 *
 * Il codice non è un vezzo: chi si è messo il sito sulla schermata Home
 * dell'iPhone ha una finestra a parte, con i suoi cookie, che non sono
 * quelli di Safari. Il link della mail apre Safari, quindi la sessione
 * nasce **fuori dall'app** e l'app resta scollegata per sempre: è
 * successo a Luka, e succederà a tutti i PR. Il codice invece si incolla
 * dentro l'app, e la sessione nasce dove serve.
 *
 * Perché l'utente lo veda: se la pagina gira in modalità "app", il
 * codice è la strada principale e il link la seconda.
 */

function LoginForm() {
  const router = useRouter();
  // Chi arriva da una pagina riservata (es. /pr) ci torna dopo il login,
  // invece di finire sulla sua card.
  const searchParams = useSearchParams();
  const grezzo = searchParams.get("next");
  const next = grezzo && grezzo.startsWith("/") && !grezzo.startsWith("//") ? grezzo : null;

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [codice, setCodice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Aperto dalla schermata Home (iOS/Android) invece che dal browser.
  const [app, setApp] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      // iOS: proprietà sua, non standard
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setApp(Boolean(standalone));
  }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          `${window.location.origin}/auth/callback` +
          (next ? `?next=${encodeURIComponent(next)}` : ""),
      },
    });
    if (err) {
      const msg = err.message?.toLowerCase() ?? "";
      if (msg.includes("rate") || msg.includes("limit") || err.status === 429) {
        setError("Troppe richieste in poco tempo. Aspetta qualche minuto e riprova.");
      } else {
        setError(err.message || "Qualcosa è andato storto. Riprova.");
      }
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  /**
   * Il codice della mail, digitato qui dentro.
   *
   * Da qui in poi si rifà a mano quello che farebbe /auth/callback: la
   * destinazione chiesta, poi lo staff, poi il profilo, poi il recupero
   * per email di chi rientra con un id diverso.
   */
  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    const token = codice.replace(/\D/g, "");
    if (token.length < 6) {
      setError("Il codice è più lungo: ricopialo tutto dalla mail.");
      return;
    }
    setLoading(true);
    setError("");
    const supabase = createClient();
    // "email" è il codice di chi rientra; "signup" quello di chi si era
    // iscritto e non ha mai confermato. Provarli tutti e due costa nulla
    // e toglie un errore che l'utente non saprebbe spiegare.
    let { error: err } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (err) {
      const secondo = await supabase.auth.verifyOtp({ email, token, type: "signup" });
      if (!secondo.error) err = null;
    }
    if (err) {
      setLoading(false);
      const msg = err.message?.toLowerCase() ?? "";
      setError(
        msg.includes("expired")
          ? "Il codice è scaduto: fattene mandare un altro."
          : msg.includes("invalid")
            ? "Codice sbagliato. Controlla le cifre, o fattene mandare un altro."
            : err.message || "Non è andata. Riprova.",
      );
      return;
    }

    if (next) {
      router.replace(next);
      return;
    }

    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (isAdmin) {
      router.replace("/admin/dashboard");
      return;
    }

    const { data: mio } = await supabase.rpc("my_profile");
    if (mio && (Array.isArray(mio) ? mio.length > 0 : true)) {
      router.replace("/card");
      return;
    }

    // Rientro con un id nuovo: il profilo si ritrova dall'email.
    const { data: linked } = await supabase.rpc("link_email_account");
    router.replace(linked ? "/card" : "/unisciti?rientro=1");
  }

  if (sent) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="font-display text-brand-red text-6xl mb-6 text-center">%</div>
        <h2 className="text-white text-xl font-semibold mb-3 text-center">Controlla la mail</h2>
        <p className="text-brand-gray text-sm max-w-xs text-center">
          Mandata a <strong className="text-white">{email}</strong>: dentro c&apos;è un{" "}
          <strong className="text-white">codice</strong> e un link. Ne basta uno.
        </p>

        {/* Il codice per primo: è l'unico che funziona dentro l'app */}
        <form onSubmit={handleCode} className="w-full max-w-xs flex flex-col gap-4 mt-8">
          {/* Il campo tiene solo cifre, e la spaziatura larga vale per il
              numero, non per il testo del placeholder: con entrambi, la
              scritta usciva dal campo e finiva sopra il resto. */}
          <label className="text-[10px] uppercase tracking-[0.25em] text-brand-gray text-center">
            il codice della mail
          </label>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            enterKeyHint="go"
            maxLength={10}
            placeholder="······"
            value={codice}
            onChange={(e) => setCodice(e.target.value.replace(/\D/g, "").slice(0, 10))}
            autoFocus
            className={`input-line text-center text-3xl ${
              codice ? "tracking-[0.3em]" : "tracking-[0.15em] text-brand-gray/40"
            }`}
          />
          {error && <p className="text-brand-red text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? "Entro…" : "Entra"}
          </button>
        </form>

        {app ? (
          <p className="text-brand-gray/60 text-[11px] leading-relaxed mt-6 max-w-xs text-center">
            Stai usando l&apos;app dalla schermata Home: <strong className="text-white">usa il
            codice</strong>. Il link aprirebbe Safari, e qui dentro resteresti scollegato.
          </p>
        ) : (
          <p className="text-brand-gray/60 text-[11px] leading-relaxed mt-6 max-w-xs text-center">
            Se hai il sito sulla schermata Home del telefono, entra da lì col codice: il link
            apre il browser, e l&apos;icona resta scollegata.
          </p>
        )}

        <button
          onClick={() => {
            setSent(false);
            setCodice("");
            setError("");
          }}
          className="mt-8 text-xs uppercase tracking-widest text-brand-gray/40 hover:text-brand-gray transition-colors"
        >
          ← mandala a un altro indirizzo
        </button>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6">
      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-2">rientra</p>
      <h1 className="font-display text-brand-red text-5xl mb-2">1%</h1>
      <p className="text-brand-gray text-sm mb-10 text-center max-w-xs">
        Inserisci la tua email. Ti mandiamo un codice e un link: ne basta uno.
      </p>

      <form onSubmit={handleSend} className="w-full max-w-xs flex flex-col gap-4">
        <input
          type="email"
          placeholder="la tua email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          className="input-line text-sm"
        />
        {error && <p className="text-brand-red text-sm">{error}</p>}
        <button type="submit" disabled={loading} className="btn btn-primary mt-2 w-full">
          {loading ? "Invio…" : "Mandami il codice"}
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

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex-1 flex items-center justify-center">
          <div className="font-display text-brand-red text-6xl animate-pulse-glow">1%</div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
