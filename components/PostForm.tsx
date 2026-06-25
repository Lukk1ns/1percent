"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAX = 80;

type Props = { onClose: () => void };

export function PostForm({ onClose }: Props) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // Sessione anonima senza profilo = non membro
      if (!user) { setLoggedIn(false); return; }
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      setLoggedIn(!!data);
    })();
  }, []);

  // Chiudi cliccando fuori
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase.rpc("create_post", { p_text: text.trim() });
    if (err) {
      setError(err.message || "Errore sconosciuto.");
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 pb-8 sm:pb-0">
      <div
        ref={ref}
        className="w-full max-w-sm"
        style={{
          background: "#FFF176",
          boxShadow: "4px 6px 20px rgba(0,0,0,0.6)",
          transform: "rotate(-1deg)",
        }}
      >
        <div className="px-5 pt-5 pb-4">
          {sent ? (
            <div className="text-center py-4">
              <p
                className="text-black text-2xl mb-2"
                style={{ fontFamily: "var(--font-caveat)" }}
              >
                Messaggio inviato ✓
              </p>
              <p
                className="text-black/60 text-sm"
                style={{ fontFamily: "var(--font-caveat)" }}
              >
                Lo vedi sulla bacheca dopo l'approvazione.
              </p>
              <button
                onClick={onClose}
                className="mt-4 text-xs uppercase tracking-widest text-black/50 underline"
              >
                Chiudi
              </button>
            </div>
          ) : loggedIn === false ? (
            <div className="text-center py-4">
              <p
                className="text-black text-xl mb-3"
                style={{ fontFamily: "var(--font-caveat)" }}
              >
                Solo i membri possono scrivere.
              </p>
              <button
                onClick={() => router.push("/unisciti")}
                className="text-xs uppercase tracking-widest text-black border border-black/30 px-4 py-2 hover:bg-black/5 transition-all"
              >
                Iscriviti →
              </button>
              <button
                onClick={onClose}
                className="mt-3 block mx-auto text-xs uppercase tracking-widest text-black/40 underline"
              >
                Annulla
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p
                className="text-black text-xl mb-3"
                style={{ fontFamily: "var(--font-caveat)" }}
              >
                Lascia un segno —
              </p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX))}
                placeholder="scrivi qualcosa..."
                rows={3}
                autoFocus
                className="w-full bg-transparent text-black placeholder-black/40 outline-none resize-none"
                style={{ fontFamily: "var(--font-caveat)", fontSize: "1.1rem" }}
              />
              <div className="flex items-center justify-between mt-3">
                <span
                  className="text-black/40 text-sm"
                  style={{ fontFamily: "var(--font-caveat)" }}
                >
                  {text.length}/{MAX}
                </span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-xs uppercase tracking-widest text-black/40 underline"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !text.trim()}
                    className="text-xs uppercase tracking-widest text-black border border-black/40 px-3 py-1.5 hover:bg-black/10 transition-all disabled:opacity-40"
                  >
                    {loading ? "…" : "Invia"}
                  </button>
                </div>
              </div>
              {error && (
                <p className="text-red-700 text-xs mt-2" style={{ fontFamily: "var(--font-caveat)" }}>
                  {error}
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
