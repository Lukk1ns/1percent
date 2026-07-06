"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getAvatar } from "@/lib/avatars";

type WallRow = {
  member_number: number;
  alias: string;
  avatar_id: string;
  poke_count: number;
  poked_by_me_today: boolean;
  is_me: boolean;
};

type ReceivedPoke = {
  alias: string;
  avatar_id: string;
  created_at: string;
  seen: boolean;
};

const MEDALS = ["🥇", "🥈", "🥉"];

function MembriWall() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Arrivando dalla notifica (?ricevuti=1) apro subito la lista "chi ti ha pokato"
  const autoOpenReceived = searchParams.get("ricevuti") === "1";
  const [rows, setRows] = useState<WallRow[]>([]);
  const [received, setReceived] = useState<ReceivedPoke[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [showReceived, setShowReceived] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [wallError, setWallError] = useState(false);
  const userIdRef = useRef<string | null>(null);

  const loadWall = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("members_wall");
    if (error) { setWallError(true); return; }
    setRows((data ?? []) as WallRow[]);
  }, []);

  const loadReceived = useCallback(async () => {
    const supabase = createClient();
    const [{ data: pokes }, { data: count }] = await Promise.all([
      supabase.rpc("my_pokes_received", { limit_count: 40 }),
      supabase.rpc("unseen_pokes_count"),
    ]);
    if (pokes) setReceived(pokes as ReceivedPoke[]);
    if (typeof count === "number") setUnseen(count);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/unisciti"); return; }
      const { data: profile } = await supabase
        .from("profiles").select("id").eq("id", user.id).single();
      if (!profile) { router.replace("/unisciti"); return; }
      userIdRef.current = user.id;

      await Promise.all([loadWall(), loadReceived()]);
      setLoading(false);

      // Arrivo dalla notifica: apro subito la lista e segno i poke come visti
      if (autoOpenReceived) {
        setShowReceived(true);
        setUnseen(0);
        await supabase.rpc("mark_pokes_seen");
      }

      // Poke in arrivo in tempo reale (la RLS fa passare solo i miei)
      channel = supabase
        .channel("my_pokes")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "pokes", filter: `to_profile=eq.${user.id}` },
          () => { loadReceived(); loadWall(); },
        )
        .subscribe();
    })();

    return () => {
      if (channel) createClient().removeChannel(channel);
    };
  }, [router, loadWall, loadReceived, autoOpenReceived]);

  async function handlePoke(target: WallRow) {
    if (target.is_me || target.poked_by_me_today) return;
    // Aggiornamento ottimistico
    setRows((prev) =>
      prev.map((r) =>
        r.member_number === target.member_number
          ? { ...r, poke_count: Number(r.poke_count) + 1, poked_by_me_today: true }
          : r,
      ),
    );
    const supabase = createClient();
    const { data, error } = await supabase.rpc("send_poke", {
      p_member_number: target.member_number,
    });
    if (error || (data !== "ok" && data !== "already")) {
      // Rollback se qualcosa è andato storto
      setRows((prev) =>
        prev.map((r) =>
          r.member_number === target.member_number
            ? { ...r, poke_count: Math.max(0, Number(r.poke_count) - 1), poked_by_me_today: false }
            : r,
        ),
      );
    }
  }

  async function toggleReceived() {
    const next = !showReceived;
    setShowReceived(next);
    if (next && unseen > 0) {
      setUnseen(0);
      const supabase = createClient();
      await supabase.rpc("mark_pokes_seen");
    }
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="font-display text-brand-red text-6xl animate-pulse-glow">1%</div>
      </main>
    );
  }

  if (wallError) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-brand-red text-5xl mb-4">👊</p>
        <p className="text-white text-lg mb-2">Il muro sta aprendo.</p>
        <p className="text-brand-gray text-sm">Torna tra poco.</p>
      </main>
    );
  }

  const filtered = search.trim()
    ? rows.filter((r) => r.alias.toLowerCase().includes(search.trim().toLowerCase()))
    : rows;
  const podium = rows.filter((r) => Number(r.poke_count) > 0).slice(0, 3);

  return (
    <main className="flex-1 flex flex-col items-center px-4 py-10 w-full max-w-md mx-auto">
      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-2">il muro</p>
      <h1 className="font-display text-brand-red text-5xl mb-3">1%</h1>
      <p className="text-brand-gray text-sm text-center mb-1 max-w-xs">
        Un <span className="text-white">poke 👊</span> al giorno a chi ti sta simpatico.
      </p>
      <p className="text-brand-gray/60 text-xs text-center mb-8 max-w-xs">
        Gli altri vedono solo i numeri. Chi lo riceve scopre chi sei.
      </p>

      {/* I miei poke ricevuti */}
      {received.length > 0 && (
        <div className="w-full mb-8">
          <button
            onClick={toggleReceived}
            className="btn btn-outline w-full relative"
          >
            👊 I tuoi poke: {received.length}
            {unseen > 0 && (
              <span className="ml-2 px-2 py-0.5 text-[10px] bg-brand-red text-white rounded-full animate-pulse-glow">
                {unseen} {unseen === 1 ? "nuovo" : "nuovi"}
              </span>
            )}
          </button>
          {showReceived && (
            <div className="mt-2 flex flex-col gap-1.5 animate-fade-up">
              <p className="text-[10px] uppercase tracking-[0.3em] text-brand-gray/60 px-1 py-1">
                stai simpatico a questa gente — solo tu puoi vederlo
              </p>
              {received.map((p, i) => (
                <div
                  key={`${p.alias}-${p.created_at}`}
                  className="flex items-center gap-2.5 px-3 py-2 border border-white/[0.06] bg-white/[0.02]"
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <span className="text-sm">{getAvatar(p.avatar_id).emoji}</span>
                  <span className="text-xs text-white/80 font-mono">{p.alias}</span>
                  {!p.seen && <span className="text-[9px] text-brand-red uppercase tracking-widest">new</span>}
                  <span className="ml-auto text-[10px] text-brand-gray/50">
                    {new Date(p.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Podio */}
      {podium.length > 0 && (
        <div className="w-full flex justify-center items-end gap-3 mb-8">
          {[1, 0, 2].map((idx) => {
            const r = podium[idx];
            if (!r) return null;
            const isFirst = idx === 0;
            return (
              <div
                key={r.member_number}
                className={`flex flex-col items-center px-3 py-3 border count-cell ${isFirst ? "border-brand-red/50 -translate-y-2" : "border-white/10"}`}
                style={{ minWidth: "5.2rem" }}
              >
                <span className="text-lg">{MEDALS[idx]}</span>
                <span className={`${isFirst ? "text-2xl" : "text-xl"} mt-1`}>{getAvatar(r.avatar_id).emoji}</span>
                <span className="text-xs text-white font-mono mt-1 max-w-[5rem] truncate">{r.alias}</span>
                <span className="font-display text-brand-red text-lg mt-0.5" style={{ textShadow: "0 0 12px rgba(224,24,31,0.4)" }}>
                  {r.poke_count} 👊
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Ricerca */}
      <input
        type="text"
        placeholder="cerca un alias..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input-line text-sm mb-6"
        autoComplete="off"
        autoCapitalize="none"
      />

      {/* Lista membri */}
      <div className="w-full flex flex-col gap-1.5">
        {filtered.map((r) => {
          const rank = rows.indexOf(r) + 1;
          return (
            <div
              key={r.member_number}
              className={`flex items-center gap-2.5 px-3 py-2.5 border transition-colors ${r.is_me ? "border-brand-red/40 bg-brand-red/[0.05]" : "border-white/[0.06] bg-white/[0.02]"}`}
              style={{ clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))" }}
            >
              <span className="text-[10px] font-mono text-brand-gray/50 w-7">#{rank}</span>
              <span className="text-lg">{getAvatar(r.avatar_id).emoji}</span>
              <span className="text-sm text-white/85 font-mono truncate">
                {r.alias}
                {r.is_me && <span className="text-brand-red/70 text-[10px] ml-1.5">tu</span>}
              </span>
              <span className="ml-auto text-xs text-brand-gray tabular-nums whitespace-nowrap">
                {r.poke_count} 👊
              </span>
              {!r.is_me && (
                <button
                  onClick={() => handlePoke(r)}
                  disabled={r.poked_by_me_today}
                  className={`shrink-0 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest border transition-all ${
                    r.poked_by_me_today
                      ? "border-white/10 text-brand-gray/40 cursor-default"
                      : "border-brand-red/60 text-white bg-brand-red/10 hover:bg-brand-red hover:scale-105 active:scale-95"
                  }`}
                  aria-label={`Poke a ${r.alias}`}
                >
                  {r.poked_by_me_today ? "✓ oggi" : "poke"}
                </button>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-brand-gray/50 text-sm py-8">Nessun alias trovato.</p>
        )}
      </div>

      {/* Nav bottom */}
      <nav className="w-full mt-10 pt-6 border-t border-white/5 flex justify-around text-[10px] uppercase tracking-widest text-brand-gray/50">
        <button onClick={() => router.push("/")} className="hover:text-brand-gray transition-colors">Home</button>
        <button onClick={() => router.push("/card")} className="hover:text-brand-gray transition-colors">Card</button>
        <button onClick={() => router.push("/pass")} className="hover:text-brand-gray transition-colors">Pass</button>
        <button onClick={() => router.push("/membri")} className="text-brand-red">Muro</button>
        <button onClick={() => router.push("/invita")} className="hover:text-brand-gray transition-colors">Invita</button>
      </nav>
    </main>
  );
}

export default function MembriPage() {
  return (
    <Suspense
      fallback={
        <main className="flex-1 flex items-center justify-center">
          <div className="font-display text-brand-red text-6xl animate-pulse-glow">1%</div>
        </main>
      }
    >
      <MembriWall />
    </Suspense>
  );
}
