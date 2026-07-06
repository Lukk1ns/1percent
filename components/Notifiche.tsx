"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Centro notifiche globale (montato nel layout → appare OVUNQUE).
 * Mostra pill fisse in alto per: messaggi non letti, richieste di
 * messaggio, poke ricevuti. Aggiornamento in tempo reale via Supabase
 * Realtime (la RLS fa arrivare solo gli eventi che mi riguardano).
 * Silenzioso se non loggato / non membro / RPC non ancora installate.
 */
export function Notifiche() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [requests, setRequests] = useState(0);
  const [pokes, setPokes] = useState(0);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [inbox, pk] = await Promise.all([
      supabase.rpc("inbox_badge"),
      supabase.rpc("unseen_pokes_count"),
    ]);
    if (inbox.data) {
      setUnread(Number(inbox.data.unread ?? 0));
      setRequests(Number(inbox.data.requests ?? 0));
    }
    if (!pk.error && typeof pk.data === "number") setPokes(pk.data);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await refresh();

      // La RLS filtra: ricevo solo gli eventi delle mie righe.
      channel = supabase
        .channel("notifiche")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refresh)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_requests" }, refresh)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_requests" }, refresh)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "pokes", filter: `to_profile=eq.${user.id}` }, refresh)
        .subscribe();
    })();

    return () => {
      if (channel) createClient().removeChannel(channel);
    };
  }, [refresh]);

  // Rinfresco anche cambiando pagina (es. dopo aver letto una chat)
  useEffect(() => {
    refresh();
  }, [pathname, refresh]);

  // Sulla pagina messaggi non ha senso avvisare dei messaggi
  const onMessaggi = pathname?.startsWith("/messaggi");
  const showInbox = !onMessaggi && (unread > 0 || requests > 0);
  const showPokes = !pathname?.startsWith("/membri") && pokes > 0;

  if (!showInbox && !showPokes) return null;

  const pillBase =
    "flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-white border bg-black/85 backdrop-blur-sm animate-fade-up";
  const clip =
    "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))";

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2">
      {showInbox && (
        <Link
          href="/messaggi"
          className={`${pillBase} border-brand-red/60`}
          style={{ clipPath: clip, boxShadow: "0 0 24px rgba(224,24,31,0.35)" }}
        >
          <span className="text-base">✉️</span>
          {requests > 0 && unread > 0
            ? "Messaggi e richieste"
            : requests > 0
              ? requests === 1
                ? "Una richiesta di messaggio"
                : "Richieste di messaggio"
              : unread === 1
                ? "Un nuovo messaggio"
                : "Nuovi messaggi"}
          <span className="px-1.5 py-0.5 text-[10px] bg-brand-red rounded-full">
            {unread + requests}
          </span>
        </Link>
      )}
      {showPokes && (
        <Link
          href="/membri?ricevuti=1"
          className={`${pillBase} border-brand-red/60`}
          style={{ clipPath: clip, boxShadow: "0 0 24px rgba(224,24,31,0.35)" }}
        >
          <span className="text-base">👊</span>
          Stai simpatico a qualcuno
          <span className="px-1.5 py-0.5 text-[10px] bg-brand-red rounded-full">{pokes}</span>
        </Link>
      )}
    </div>
  );
}
