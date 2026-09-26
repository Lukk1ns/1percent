"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MsgDirezione = {
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

function quando(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * La conversazione fra la direzione e una persona (script 37).
 * Si apre dalla posta (richieste foto) e dallo Staff (candidature).
 * Lei la trova nei suoi Messaggi sul sito e può rispondere.
 */
export function ConversazioneDirezione({
  profileId,
  chi,
  rimozioneId,
  onCambio,
}: {
  profileId: string;
  chi: string;
  /** Se si apre da una richiesta foto: il primo messaggio porta con sé
   *  di quale foto si parla, così lei capisce a cosa rispondi. */
  rimozioneId?: string;
  /** Chiamata dopo ogni lettura: serve alla posta per rifare i contatori. */
  onCambio?: () => void;
}) {
  const [msgs, setMsgs] = useState<MsgDirezione[] | null>(null);
  const [testo, setTesto] = useState("");
  const [invio, setInvio] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fondo = useRef<HTMLDivElement>(null);

  const leggi = useCallback(async () => {
    const { data, error } = await createClient().rpc("admin_direzione_thread", {
      p_profile: profileId,
    });
    if (error) {
      setErr(error.message);
      setMsgs([]);
      return;
    }
    setMsgs((data as MsgDirezione[]) ?? []);
    setTimeout(() => fondo.current?.scrollIntoView({ block: "nearest" }), 60);
    // Aprirla la segna come letta: il pallino della posta va rifatto.
    onCambio?.();
  }, [profileId, onCambio]);

  useEffect(() => {
    (async () => {
      await leggi();
    })();
    const supabase = createClient();
    const canale = supabase
      .channel(`direzione_${profileId}_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direzione_messaggi",
          filter: `profile_id=eq.${profileId}`,
        },
        () => leggi(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canale);
    };
  }, [profileId, leggi]);

  async function manda() {
    const t = testo.trim();
    if (!t || invio) return;
    setInvio(true);
    setErr(null);
    const { data, error } = await createClient().rpc("admin_direzione_scrivi", {
      p_profile: profileId,
      p_testo: t,
      p_rimozione: rimozioneId ?? null,
    });
    setInvio(false);
    if (error || data !== "ok") {
      setErr(
        data === "non_trovato"
          ? "Questa persona ha cancellato l'account."
          : data === "troppo_lungo"
            ? "Troppo lungo: massimo 1000 caratteri."
            : (error?.message ?? "Non inviato. Riprova."),
      );
      return;
    }
    setTesto("");
    await leggi();
  }

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      {msgs === null ? (
        <p className="py-3 text-center font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
          carico…
        </p>
      ) : msgs.length === 0 ? (
        <p className="pb-3 text-[11px] leading-relaxed text-brand-gray/80">
          Nessun messaggio ancora. Quello che scrivi arriva a{" "}
          <span className="text-white">{chi}</span> nei suoi Messaggi sul sito, firmato
          &laquo;1% · direzione&raquo;, e potrà risponderti.
        </p>
      ) : (
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pb-3">
          {msgs.map((m) => (
            <div
              key={m.id}
              className={`flex max-w-[85%] flex-col ${m.da_direzione ? "self-end items-end" : "self-start items-start"}`}
            >
              {m.album && (
                <p className="mb-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray/70">
                  sulla foto in {m.album}
                </p>
              )}
              <div
                className={`whitespace-pre-wrap px-3 py-2 text-[13px] leading-snug ${
                  m.da_direzione
                    ? "border border-brand-red/30 bg-brand-red/15 text-white"
                    : "border border-white/10 bg-white/[0.04] text-white/90"
                }`}
              >
                {m.testo}
              </div>
              <span className="mt-0.5 text-[9px] text-white/30">
                {m.da_direzione ? "tu · " : `${chi} · `}
                {quando(m.created_at)}
                {m.da_direzione && m.letto_at && " · letto"}
              </span>
            </div>
          ))}
          <div ref={fondo} />
        </div>
      )}

      <textarea
        value={testo}
        onChange={(e) => setTesto(e.target.value.slice(0, 1000))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            manda();
          }
        }}
        rows={3}
        placeholder={`scrivi a ${chi}…`}
        className="w-full resize-y border border-white/15 bg-black px-3 py-2 text-sm text-white placeholder-brand-gray/50 outline-none focus:border-brand-red"
      />
      {err && <p className="mt-1 text-[11px] text-brand-red">{err}</p>}
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[10px] leading-snug text-brand-gray/60">
          La legge quando apre il sito: non parte né mail né notifica sul telefono.
        </p>
        <button
          onClick={manda}
          disabled={invio || !testo.trim()}
          className="flex-shrink-0 bg-brand-red px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-white disabled:opacity-40"
        >
          {invio ? "…" : "invia"}
        </button>
      </div>
    </div>
  );
}
