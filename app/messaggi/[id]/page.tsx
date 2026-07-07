"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchLegami } from "@/lib/legami";
import Volto from "@/components/Volto";

type Msg = {
  id: string;
  mine: boolean;
  body: string;
  created_at: string;
  read_at: string | null;
};

type Other = {
  member_number: number;
  alias: string;
  avatar_id: string | null;
  photo_blur_path: string | null;
  photo_updated_at: string | null;
};

export default function ChatPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const convoId = params.id;

  const [other, setOther] = useState<Other | null>(null);
  const [clearUrl, setClearUrl] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollDown = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
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

      // Chi è l'altro? (my_conversations mi dà solo le mie)
      const { data: convs } = await supabase.rpc("my_conversations");
      const c = (convs ?? []).find(
        (x: { conversation_id: string }) => x.conversation_id === convoId,
      );
      if (!c) {
        router.replace("/messaggi");
        return;
      }
      setOther(c as Other);

      const [{ data: messages }, legami] = await Promise.all([
        supabase.rpc("conversation_messages", { p_conversation: convoId, limit_count: 100 }),
        fetchLegami(supabase),
      ]);
      setMsgs(((messages ?? []) as Msg[]).slice().reverse());
      setClearUrl(legami.clearUrls.get((c as Other).member_number) ?? null);
      setLoading(false);
      scrollDown();
      await supabase.rpc("mark_conversation_read", { p_conversation: convoId });

      // Messaggi in arrivo in tempo reale
      channel = supabase
        .channel(`chat_${convoId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convoId}` },
          async (payload) => {
            const m = payload.new as { id: string; sender: string; body: string; created_at: string };
            if (m.sender === user.id) return; // i miei li ho già messi
            setMsgs((prev) => [
              ...prev,
              { id: m.id, mine: false, body: m.body, created_at: m.created_at, read_at: null },
            ]);
            scrollDown();
            await supabase.rpc("mark_conversation_read", { p_conversation: convoId });
          },
        )
        .subscribe();
    })();

    return () => {
      if (channel) createClient().removeChannel(channel);
    };
  }, [convoId, router, scrollDown]);

  async function handleSend() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    const tempId = `tmp_${Date.now()}`;
    setMsgs((prev) => [
      ...prev,
      { id: tempId, mine: true, body, created_at: new Date().toISOString(), read_at: null },
    ]);
    scrollDown();

    const supabase = createClient();
    const { data, error } = await supabase.rpc("send_message", {
      p_conversation: convoId,
      p_body: body,
    });
    setSending(false);
    if (error || data !== "ok") {
      setMsgs((prev) => prev.filter((m) => m.id !== tempId));
      setInfo(
        data === "rate"
          ? "Piano. Max 20 messaggi al minuto."
          : data === "blocked"
            ? "Questa conversazione è chiusa."
            : "Messaggio non inviato. Riprova.",
      );
      setTimeout(() => setInfo(null), 3000);
    }
  }

  async function handleBlock() {
    if (!other) return;
    if (!window.confirm(`Bloccare ${other.alias}? La chat si chiude e sparite l'uno per l'altro.`)) return;
    const supabase = createClient();
    await supabase.rpc("block_member", { p_member_number: other.member_number });
    router.replace("/messaggi");
  }

  async function handleReport() {
    if (!other) return;
    const reason = window.prompt(`Perché segnali ${other.alias}? (arriva solo allo staff)`);
    if (!reason?.trim()) return;
    const supabase = createClient();
    const { data } = await supabase.rpc("report_member", {
      p_member_number: other.member_number,
      p_reason: reason.trim(),
    });
    setInfo(data === "ok" ? "Segnalazione inviata allo staff." : "Segnalazione non inviata.");
    setTimeout(() => setInfo(null), 3000);
  }

  if (loading || !other) {
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
        <button onClick={() => router.push("/messaggi")} className="text-brand-gray hover:text-white transition-colors text-lg" aria-label="Indietro">
          ←
        </button>
        <button
          onClick={() => router.push(`/u/${encodeURIComponent(other.alias)}`)}
          className="flex items-center gap-2.5 flex-1 min-w-0"
        >
          <Volto
            clearUrl={clearUrl}
            photoBlurPath={other.photo_blur_path}
            photoUpdatedAt={other.photo_updated_at}
            avatarId={other.avatar_id}
            size={36}
            alt={other.alias}
          />
          <span className="text-sm text-white font-mono truncate">{other.alias}</span>
          {clearUrl && <span className="text-[8px] uppercase tracking-widest text-brand-red shrink-0">🔗 legame</span>}
        </button>
        <button onClick={handleReport} className="text-[9px] uppercase tracking-widest text-brand-gray/50 hover:text-white transition-colors">
          segnala
        </button>
        <button onClick={handleBlock} className="text-[9px] uppercase tracking-widest text-brand-gray/50 hover:text-brand-red transition-colors">
          blocca
        </button>
      </header>

      {/* Messaggi */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-2">
        {msgs.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] px-3 py-2 text-sm leading-snug ${
              m.mine
                ? "self-end bg-brand-red/15 border border-brand-red/30 text-white"
                : "self-start bg-white/[0.04] border border-white/10 text-white/90"
            }`}
            style={{
              clipPath: m.mine
                ? "polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)"
                : "polygon(0 0, 100% 0, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
            }}
          >
            {m.body}
            <span className="block text-[8px] text-white/30 mt-1 text-right">
              {new Date(m.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
              {m.mine && m.read_at && " ✓✓"}
            </span>
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
          placeholder="scrivi..."
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
