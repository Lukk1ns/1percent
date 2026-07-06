"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchLegami, type Legame } from "@/lib/legami";
import Volto from "@/components/Volto";

export default function LegamiPage() {
  const router = useRouter();
  const [legami, setLegami] = useState<Legame[]>([]);
  const [clearUrls, setClearUrls] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/unisciti");
        return;
      }
      const res = await fetchLegami(supabase);
      setLegami(res.legami);
      setClearUrls(res.clearUrls);
      setLoading(false);
    })();
  }, [router]);

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="font-display text-brand-red text-6xl animate-pulse-glow">1%</div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center px-4 py-10 w-full max-w-md mx-auto">
      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-2">i tuoi legami</p>
      <h1 className="font-display text-brand-red text-5xl mb-3">1%</h1>
      <p className="text-brand-gray text-sm text-center mb-8 max-w-xs">
        Poke reciproco = <span className="text-white">vi vedete davvero</span>. Solo voi due.
      </p>

      {legami.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <p className="font-display text-brand-red/60 text-6xl mb-4">🔗</p>
          <p className="text-white text-lg mb-2">Ancora nessun legame.</p>
          <p className="text-brand-gray text-sm max-w-xs mb-6">
            Poka. Fatti pokare. Quando il cerchio si chiude, il volto si rivela.
          </p>
          <button onClick={() => router.push("/membri")} className="btn btn-primary">
            Vai al muro
          </button>
        </div>
      ) : (
        <>
          <p className="text-brand-gray/50 text-[10px] uppercase tracking-widest mb-4">
            {legami.length} {legami.length === 1 ? "volto rivelato" : "volti rivelati"}
          </p>
          <div className="w-full grid grid-cols-2 gap-3">
            {legami.map((l, i) => (
              <button
                key={l.member_number}
                onClick={() => router.push(`/u/${encodeURIComponent(l.alias)}`)}
                className="flex flex-col items-center px-3 py-4 border border-brand-red/25 bg-white/[0.02] hover:border-brand-red/60 transition-colors animate-fade-up"
                style={{
                  clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
                  animationDelay: `${i * 0.05}s`,
                }}
              >
                <Volto
                  clearUrl={clearUrls.get(l.member_number) ?? null}
                  photoBlurPath={clearUrls.get(l.member_number) ? null : l.photo_blur_path}
                  photoUpdatedAt={l.photo_updated_at}
                  avatarId={l.avatar_id}
                  size={84}
                  alt={l.alias}
                />
                <span className="text-sm text-white font-mono mt-2 max-w-full truncate">{l.alias}</span>
                {l.bio && (
                  <span className="text-[10px] text-brand-gray/70 italic mt-1 max-w-full truncate">
                    {l.bio}
                  </span>
                )}
                <span className="text-[9px] uppercase tracking-widest text-brand-red/70 mt-2">
                  dal {new Date(l.linked_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Nav bottom */}
      <nav className="w-full mt-10 pt-6 border-t border-white/5 flex justify-around text-[10px] uppercase tracking-widest text-brand-gray/50">
        <button onClick={() => router.push("/")} className="hover:text-brand-gray transition-colors">Home</button>
        <button onClick={() => router.push("/card")} className="hover:text-brand-gray transition-colors">Card</button>
        <button onClick={() => router.push("/membri")} className="hover:text-brand-gray transition-colors">Muro</button>
        <button onClick={() => router.push("/legami")} className="text-brand-red">Legami</button>
        <button onClick={() => router.push("/profilo")} className="hover:text-brand-gray transition-colors">Profilo</button>
      </nav>
    </main>
  );
}
