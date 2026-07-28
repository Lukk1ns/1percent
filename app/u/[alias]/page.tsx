"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchLegami } from "@/lib/legami";
import Volto from "@/components/Volto";
import RevealLegame from "@/components/RevealLegame";

type PublicProfile = {
  member_number: number;
  alias: string;
  avatar_id: string | null;
  photo_blur_path: string | null;
  photo_updated_at: string | null;
  bio: string | null;
  created_at: string;
  archetype: string | null;
  poke_count: number;
  poke_rank: number;
  poked_by_me_today: boolean;
  is_me: boolean;
};

export default function ProfiloPubblicoPage() {
  const router = useRouter();
  const params = useParams<{ alias: string }>();
  const alias = decodeURIComponent(params.alias ?? "");

  const [p, setP] = useState<PublicProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasLink, setHasLink] = useState(false);
  const [clearUrl, setClearUrl] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [composeText, setComposeText] = useState("");
  const [composeInfo, setComposeInfo] = useState<string | null>(null);
  const [composeSending, setComposeSending] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/unisciti");
      return;
    }
    const { data, error } = await supabase.rpc("public_profile", { p_alias: alias });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      // O l'alias non esiste, o chi guarda non è un membro
      setNotFound(true);
      setLoading(false);
      return;
    }
    setP(row as PublicProfile);

    // Legame? Allora il volto è nitido (URL firmato: lo decide il server).
    const prof = row as PublicProfile;
    if (!prof.is_me) {
      const res = await fetchLegami(supabase);
      setHasLink(res.legami.some((l) => l.member_number === prof.member_number));
      setClearUrl(res.clearUrls.get(prof.member_number) ?? null);
    }
    setLoading(false);
  }, [alias, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePoke() {
    if (!p || p.is_me || p.poked_by_me_today) return;
    setP({
      ...p,
      poke_count: Number(p.poke_count) + 1,
      poked_by_me_today: true,
    });
    const supabase = createClient();
    const { data, error } = await supabase.rpc("send_poke", {
      p_member_number: p.member_number,
    });
    if (data === "link") {
      // Poke reciproco: rivelazione
      const res = await fetchLegami(supabase);
      const url = res.clearUrls.get(p.member_number) ?? null;
      setHasLink(true);
      setClearUrl(url);
      setReveal(true);
      return;
    }
    if (error || (data !== "ok" && data !== "already")) {
      setP((prev) =>
        prev
          ? {
              ...prev,
              poke_count: Math.max(0, Number(prev.poke_count) - 1),
              poked_by_me_today: false,
            }
          : prev,
      );
    }
  }

  async function handleSendRequest() {
    if (!p || !composeText.trim() || composeSending) return;
    setComposeSending(true);
    setComposeInfo(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("send_chat_request", {
      p_member_number: p.member_number,
      p_message: composeText.trim(),
    });
    setComposeSending(false);
    if (error || !data?.status) {
      setComposeInfo("Qualcosa è andato storto. Riprova.");
      return;
    }
    switch (data.status) {
      case "legame_open":
      case "exists":
        router.push(`/messaggi/${data.conversation_id}`);
        return;
      case "ok":
        setShowCompose(false);
        setComposeText("");
        setComposeInfo("Richiesta inviata. Se accetta, la chat si apre.");
        return;
      case "pending":
        setComposeInfo("Richiesta già inviata. Ora si aspetta.");
        return;
      case "cooldown":
        setComposeInfo("Ha già detto no. Riprova tra un mese — o mai.");
        return;
      case "limit_pending":
        setComposeInfo("Hai già 3 richieste in attesa. Calma.");
        return;
      case "limit_daily":
        setComposeInfo("10 richieste in un giorno bastano.");
        return;
      default:
        setComposeInfo("Non si può, per ora.");
    }
  }

  async function handleBlock() {
    if (!p) return;
    if (!window.confirm(`Bloccare ${p.alias}? Sparite l'uno per l'altro.`)) return;
    const supabase = createClient();
    await supabase.rpc("block_member", { p_member_number: p.member_number });
    router.replace("/membri");
  }

  async function handleReport() {
    if (!p) return;
    const reason = window.prompt(`Perché segnali ${p.alias}? (arriva solo allo staff)`);
    if (!reason?.trim()) return;
    const supabase = createClient();
    const { data } = await supabase.rpc("report_member", {
      p_member_number: p.member_number,
      p_reason: reason.trim(),
    });
    setComposeInfo(data === "ok" ? "Segnalazione inviata allo staff." : "Segnalazione non inviata.");
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="font-display text-brand-red text-6xl animate-pulse-glow">1%</div>
      </main>
    );
  }

  if (notFound || !p) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-brand-red text-6xl mb-4">?</p>
        <p className="text-white text-lg mb-2">Nessuno, qui.</p>
        <p className="text-brand-gray text-sm mb-6">O non esiste, o non sei dei nostri.</p>
        <button onClick={() => router.push("/membri")} className="btn btn-outline text-xs">
          ← Torna al muro
        </button>
      </main>
    );
  }

  const showRank = Number(p.poke_count) > 0;

  return (
    <main className="flex-1 flex flex-col items-center px-4 py-10 w-full max-w-md mx-auto">
      {reveal && (
        <RevealLegame
          alias={p.alias}
          clearUrl={clearUrl}
          avatarId={p.avatar_id}
          onClose={() => setReveal(false)}
        />
      )}
      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-6">membro dell&apos;1%</p>

      {/* Il volto (nitido solo se c'è il Legame) */}
      <Volto
        clearUrl={clearUrl}
        photoBlurPath={p.photo_blur_path}
        photoUpdatedAt={p.photo_updated_at}
        avatarId={p.avatar_id}
        size={160}
        alt={p.alias}
        className={p.photo_blur_path ? "border border-brand-red/40" : ""}
      />

      <h1 className="text-white font-mono text-2xl mt-4">{p.alias}</h1>
      <p className="text-brand-gray/60 text-xs font-mono mt-1">#{p.member_number}</p>

      {/* Badge */}
      <div className="flex gap-2 mt-3">
        {hasLink && (
          <span
            className="px-2 py-1 text-[9px] uppercase tracking-widest bg-brand-red/15 border border-brand-red text-white"
            style={{ textShadow: "0 0 8px rgba(224,24,31,0.6)" }}
          >
            🔗 legame
          </span>
        )}
        {p.archetype && (
          <span className="px-2 py-1 text-[9px] uppercase tracking-widest border border-white/15 text-brand-gray">
            {p.archetype}
          </span>
        )}
      </div>

      {/* Bio */}
      {p.bio && (
        <p className="text-white/80 text-sm text-center mt-5 max-w-xs italic">&ldquo;{p.bio}&rdquo;</p>
      )}

      {/* Statistiche poke */}
      <div className="flex items-center gap-8 mt-8">
        <div className="flex flex-col items-center">
          <span className="font-display text-brand-red text-3xl" style={{ textShadow: "0 0 12px rgba(224,24,31,0.4)" }}>
            {p.poke_count}
          </span>
          <span className="text-[9px] uppercase tracking-widest text-brand-gray/60 mt-1">poke 👊</span>
        </div>
        {showRank && (
          <div className="flex flex-col items-center">
            <span className="font-display text-white text-3xl">#{p.poke_rank}</span>
            <span className="text-[9px] uppercase tracking-widest text-brand-gray/60 mt-1">in classifica</span>
          </div>
        )}
        <div className="flex flex-col items-center">
          <span className="font-display text-white text-3xl">
            {new Date(p.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
          </span>
          <span className="text-[9px] uppercase tracking-widest text-brand-gray/60 mt-1">dentro dal</span>
        </div>
      </div>

      {/* Azioni */}
      {p.is_me ? (
        <div className="flex flex-col items-center mt-8 w-full">
          <p className="text-brand-gray/60 text-[11px] text-center mb-3">
            È così che ti vedono gli altri.
          </p>
          <button onClick={() => router.push("/profilo")} className="btn btn-outline w-full">
            Modifica il tuo profilo
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center mt-8 w-full gap-3">
          <button
            onClick={handlePoke}
            disabled={p.poked_by_me_today}
            className={`btn w-full ${p.poked_by_me_today ? "btn-outline opacity-40 cursor-default" : "btn-primary"}`}
          >
            {p.poked_by_me_today ? "✓ pokato oggi" : "👊 Poke"}
          </button>

          {!showCompose ? (
            <button onClick={() => { setShowCompose(true); setComposeInfo(null); }} className="btn btn-outline w-full">
              ✉️ Scrivi
            </button>
          ) : (
            <div className="w-full animate-fade-up">
              <p className="text-[10px] uppercase tracking-[0.3em] text-brand-gray/60 mb-2">
                {hasLink ? "legame: la chat si apre subito" : "il primo messaggio arriva come richiesta"}
              </p>
              <textarea
                value={composeText}
                onChange={(e) => setComposeText(e.target.value.slice(0, 280))}
                placeholder={hasLink ? "scrivi..." : "una frase buona. ne hai una sola."}
                rows={2}
                className="input-line text-sm w-full resize-none"
                autoFocus
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-brand-gray/40 font-mono">{composeText.length}/280</span>
                <div className="flex gap-2">
                  <button onClick={() => setShowCompose(false)} className="btn btn-ghost text-[10px]">
                    Annulla
                  </button>
                  <button
                    onClick={handleSendRequest}
                    disabled={!composeText.trim() || composeSending}
                    className={`btn text-[10px] ${composeText.trim() ? "btn-primary" : "btn-outline opacity-40"}`}
                  >
                    {composeSending ? "..." : "Invia"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {composeInfo && <p className="text-brand-red text-xs text-center">{composeInfo}</p>}

          <div className="flex gap-4 mt-2">
            <button onClick={handleReport} className="text-[9px] uppercase tracking-widest text-brand-gray/40 hover:text-white transition-colors">
              segnala
            </button>
            <button onClick={handleBlock} className="text-[9px] uppercase tracking-widest text-brand-gray/40 hover:text-brand-red transition-colors">
              blocca
            </button>
          </div>
        </div>
      )}

      {/* Nav bottom */}
      <nav className="w-full mt-10 pt-6 border-t border-white/5 flex justify-around text-[10px] uppercase tracking-widest text-brand-gray/50">
        <button onClick={() => router.push("/")} className="hover:text-brand-gray transition-colors">Home</button>
        <button onClick={() => router.push("/card")} className="hover:text-brand-gray transition-colors">Card</button>
        <button onClick={() => router.push("/membri")} className="hover:text-brand-gray transition-colors">Muro</button>
        <button onClick={() => router.push("/messaggi")} className="hover:text-brand-gray transition-colors">Chat</button>
        <button onClick={() => router.push("/profilo")} className="hover:text-brand-gray transition-colors">Profilo</button>
      </nav>
    </main>
  );
}
