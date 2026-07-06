"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchLegami } from "@/lib/legami";
import Volto from "@/components/Volto";

type ChatRequest = {
  id: string;
  direction: "in" | "out";
  member_number: number;
  alias: string;
  avatar_id: string | null;
  photo_blur_path: string | null;
  photo_updated_at: string | null;
  message: string;
  created_at: string;
};

type Conversation = {
  conversation_id: string;
  member_number: number;
  alias: string;
  avatar_id: string | null;
  photo_blur_path: string | null;
  photo_updated_at: string | null;
  last_message_at: string;
  last_body: string | null;
  last_is_mine: boolean;
  unread_count: number;
};

export default function MessaggiPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<ChatRequest[]>([]);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [clearUrls, setClearUrls] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [notReady, setNotReady] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: reqs, error: e1 }, { data: convs, error: e2 }, legami] =
      await Promise.all([
        supabase.rpc("my_chat_requests"),
        supabase.rpc("my_conversations"),
        fetchLegami(supabase),
      ]);
    if (e1 && e2) {
      setNotReady(true);
      setLoading(false);
      return;
    }
    setRequests((reqs ?? []) as ChatRequest[]);
    setConvos((convs ?? []) as Conversation[]);
    setClearUrls(legami.clearUrls);
    setLoading(false);
  }, []);

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
      await load();

      // Nuovi messaggi o richieste → ricarico (la RLS filtra i miei)
      channel = supabase
        .channel("inbox")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, load)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_requests" }, load)
        .subscribe();
    })();

    return () => {
      if (channel) createClient().removeChannel(channel);
    };
  }, [router, load]);

  async function respond(req: ChatRequest, accept: boolean) {
    const supabase = createClient();
    const { data } = await supabase.rpc("respond_chat_request", {
      p_request: req.id,
      p_accept: accept,
    });
    if (accept && data?.status === "accepted" && data?.conversation_id) {
      router.push(`/messaggi/${data.conversation_id}`);
      return;
    }
    setRequests((prev) => prev.filter((r) => r.id !== req.id));
  }

  async function blockFromRequest(req: ChatRequest) {
    if (!window.confirm(`Bloccare ${req.alias}? Non potrà più scriverti né trovarti.`)) return;
    const supabase = createClient();
    await supabase.rpc("block_member", { p_member_number: req.member_number });
    setRequests((prev) => prev.filter((r) => r.id !== req.id));
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="font-display text-brand-red text-6xl animate-pulse-glow">1%</div>
      </main>
    );
  }

  if (notReady) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-brand-red text-5xl mb-4">✉️</p>
        <p className="text-white text-lg mb-2">I messaggi stanno arrivando.</p>
        <p className="text-brand-gray text-sm">Torna tra poco.</p>
      </main>
    );
  }

  const incoming = requests.filter((r) => r.direction === "in");
  const outgoing = requests.filter((r) => r.direction === "out");

  return (
    <main className="flex-1 flex flex-col items-center px-4 py-10 w-full max-w-md mx-auto">
      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-2">messaggi</p>
      <h1 className="font-display text-brand-red text-5xl mb-8">1%</h1>

      {/* Richieste in arrivo */}
      {incoming.length > 0 && (
        <section className="w-full mb-8">
          <p className="text-[10px] uppercase tracking-[0.3em] text-brand-red/80 mb-2">
            richieste — decidi tu
          </p>
          <div className="flex flex-col gap-2">
            {incoming.map((r) => (
              <div
                key={r.id}
                className="px-3 py-3 border border-brand-red/30 bg-brand-red/[0.04] animate-fade-up"
                style={{ clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))" }}
              >
                <button
                  onClick={() => router.push(`/u/${encodeURIComponent(r.alias)}`)}
                  className="flex items-center gap-2.5 mb-2"
                >
                  <Volto
                    photoBlurPath={r.photo_blur_path}
                    photoUpdatedAt={r.photo_updated_at}
                    avatarId={r.avatar_id}
                    size={34}
                    alt={r.alias}
                  />
                  <span className="text-sm text-white font-mono">{r.alias}</span>
                </button>
                <p className="text-sm text-white/85 mb-3">&ldquo;{r.message}&rdquo;</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => respond(r, true)} className="btn btn-primary text-[10px] flex-1">
                    Accetta
                  </button>
                  <button onClick={() => respond(r, false)} className="btn btn-outline text-[10px] flex-1">
                    Rifiuta
                  </button>
                  <button
                    onClick={() => blockFromRequest(r)}
                    className="text-[9px] uppercase tracking-widest text-brand-gray/50 hover:text-brand-red px-2 transition-colors"
                  >
                    blocca
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Conversazioni */}
      <section className="w-full">
        {convos.length === 0 && incoming.length === 0 ? (
          <div className="flex flex-col items-center text-center py-10">
            <p className="text-white text-lg mb-2">Silenzio, per ora.</p>
            <p className="text-brand-gray text-sm max-w-xs mb-6">
              Apri il profilo di qualcuno e scrivi. Se c&apos;è un Legame, la chat è già aperta.
            </p>
            <button onClick={() => router.push("/membri")} className="btn btn-primary">
              Vai al muro
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {convos.map((c) => (
              <button
                key={c.conversation_id}
                onClick={() => router.push(`/messaggi/${c.conversation_id}`)}
                className={`flex items-center gap-2.5 px-3 py-2.5 border text-left transition-colors ${
                  Number(c.unread_count) > 0
                    ? "border-brand-red/40 bg-brand-red/[0.05]"
                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/15"
                }`}
                style={{ clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))" }}
              >
                <Volto
                  clearUrl={clearUrls.get(c.member_number) ?? null}
                  photoBlurPath={c.photo_blur_path}
                  photoUpdatedAt={c.photo_updated_at}
                  avatarId={c.avatar_id}
                  size={38}
                  alt={c.alias}
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-white font-mono truncate">{c.alias}</span>
                  {c.last_body && (
                    <span className="block text-xs text-brand-gray/70 truncate">
                      {c.last_is_mine ? "tu: " : ""}
                      {c.last_body}
                    </span>
                  )}
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="text-[9px] text-brand-gray/50">
                    {new Date(c.last_message_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                  </span>
                  {Number(c.unread_count) > 0 && (
                    <span className="px-1.5 py-0.5 text-[9px] bg-brand-red text-white rounded-full">
                      {c.unread_count}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Richieste in uscita */}
      {outgoing.length > 0 && (
        <section className="w-full mt-6">
          <p className="text-[10px] uppercase tracking-[0.3em] text-brand-gray/50 mb-2">in attesa</p>
          {outgoing.map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-brand-gray/60">
              <span className="font-mono">{r.alias}</span>
              <span className="text-[9px] uppercase tracking-widest ml-auto">inviata {new Date(r.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}</span>
            </div>
          ))}
        </section>
      )}

      {/* Nav bottom */}
      <nav className="w-full mt-10 pt-6 border-t border-white/5 flex justify-around text-[10px] uppercase tracking-widest text-brand-gray/50">
        <button onClick={() => router.push("/")} className="hover:text-brand-gray transition-colors">Home</button>
        <button onClick={() => router.push("/membri")} className="hover:text-brand-gray transition-colors">Muro</button>
        <button onClick={() => router.push("/legami")} className="hover:text-brand-gray transition-colors">Legami</button>
        <button onClick={() => router.push("/messaggi")} className="text-brand-red">Chat</button>
        <button onClick={() => router.push("/profilo")} className="hover:text-brand-gray transition-colors">Profilo</button>
      </nav>
    </main>
  );
}
