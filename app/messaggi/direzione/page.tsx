"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * La conversazione con la direzione dell'1%.
 *
 * La apre solo la direzione, di solito per rispondere a chi ha chiesto
 * di togliere una foto. Qui la persona la legge e risponde. Niente
 * blocca/segnala: dall'altra parte c'è l'organizzazione, non un membro.
 */

type Msg = {
  id: string;
  da_direzione: boolean;
  testo: string;
  created_at: string;
  letto_at: string | null;
  album: string | null;
  album_slug: string | null;
  photo_id: string | null;
  motivo: string | null;
};

export default function DirezionePage() {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollDown = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
  }, []);

  // Leggerla la segna come letta: il pallino in alto si spegne.
  // Torna quanti messaggi ci sono, -1 se la funzione non risponde.
  const leggi = useCallback(async () => {
    const { data, error } = await createClient().rpc("direzione_miei");
    if (error) return -1;
    setMsgs((data ?? []) as Msg[]);
    scrollDown();
    return (data ?? []).length;
  }, [scrollDown]);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/unisciti");
        return;
      }

      // Nessuna conversazione (o script 37 non incollato): qui non c'è
      // niente da leggere e scrivere per primi non si può.
      const quanti = await leggi();
      if (quanti <= 0) {
        router.replace("/messaggi");
        return;
      }
      setLoading(false);

      channel = supabase
        .channel("direzione_mia")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "direzione_messaggi",
            filter: `profile_id=eq.${user.id}`,
          },
          (payload) => {
            // Le mie le ho già in pagina; ricarico solo quando scrive la direzione.
            if ((payload.new as { da_direzione: boolean }).da_direzione) leggi();
          },
        )
        .subscribe();
    })();

    return () => {
      if (channel) createClient().removeChannel(channel);
    };
  }, [router, leggi]);

  async function handleSend() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    const tempId = `tmp_${Date.now()}`;
    setMsgs((prev) => [
      ...prev,
      {
        id: tempId,
        da_direzione: false,
        testo: body,
        created_at: new Date().toISOString(),
        letto_at: null,
        album: null,
        album_slug: null,
        photo_id: null,
        motivo: null,
      },
    ]);
    scrollDown();

    const { data, error } = await createClient().rpc("direzione_rispondi", { p_testo: body });
    setSending(false);
    if (error || data !== "ok") {
      setMsgs((prev) => prev.filter((m) => m.id !== tempId));
      setText(body);
      setInfo(
        data === "rate"
          ? "Piano. Troppi messaggi di fila, riprova tra poco."
          : data === "chiusa"
            ? "Questa conversazione è chiusa."
            : "Messaggio non inviato. Riprova.",
      );
      setTimeout(() => setInfo(null), 3000);
    }
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="font-display text-brand-red text-6xl animate-pulse-glow">1%</div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col w-full max-w-md mx-auto px-4 py-6" style={{ minHeight: "100dvh" }}>
      {/* Header */}
      <header className="flex items-center gap-3 pb-4 border-b border-white/10">
        <button
          onClick={() => router.push("/messaggi")}
          className="text-brand-gray hover:text-white transition-colors text-lg"
          aria-label="Indietro"
        >
          ←
        </button>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-brand-red/50 font-display text-base text-brand-red">
          1%
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-white truncate">1% · direzione</span>
          <span className="block text-[10px] uppercase tracking-widest text-brand-gray/60">
            ti risponde l&apos;organizzazione
          </span>
        </span>
      </header>

      {/* Messaggi */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-2">
        {msgs.map((m) => (
          <div key={m.id} className={`flex flex-col max-w-[80%] ${m.da_direzione ? "self-start" : "self-end"}`}>
            {/* Di quale foto si parla: la sua richiesta, sopra la prima risposta. */}
            {m.album && (
              <div className="mb-2 flex gap-2 border border-white/10 bg-white/[0.02] p-2">
                {m.photo_id && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/foto/${m.photo_id}?f=thumb`}
                    alt=""
                    className="h-12 w-12 flex-shrink-0 object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                <span className="min-w-0 text-[11px] leading-snug text-brand-gray">
                  La tua richiesta sulla foto in{" "}
                  <span className="text-white">{m.album}</span>
                  {m.motivo && <span className="block mt-0.5 italic text-white/60">«{m.motivo}»</span>}
                </span>
              </div>
            )}
            <div
              className={`px-3 py-2 text-sm leading-snug whitespace-pre-wrap ${
                m.da_direzione
                  ? "bg-white/[0.04] border border-white/10 text-white/90"
                  : "bg-brand-red/15 border border-brand-red/30 text-white"
              }`}
              style={{
                clipPath: m.da_direzione
                  ? "polygon(0 0, 100% 0, 100% 100%, 8px 100%, 0 calc(100% - 8px))"
                  : "polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)",
              }}
            >
              {m.testo}
              <span className="block text-[8px] text-white/30 mt-1 text-right">
                {new Date(m.created_at).toLocaleString("it-IT", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {!m.da_direzione && m.letto_at && " ✓✓"}
              </span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {info && <p className="text-brand-red text-xs text-center pb-2">{info}</p>}

      {/* Input */}
      <div className="flex items-end gap-2 pt-3 border-t border-white/10">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 1000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="rispondi..."
          rows={1}
          className="input-line text-sm flex-1 resize-none"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className={`btn text-xs shrink-0 ${text.trim() ? "btn-primary" : "btn-outline opacity-40"}`}
        >
          →
        </button>
      </div>
    </main>
  );
}
