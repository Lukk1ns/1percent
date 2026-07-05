"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function InvitaPage() {
  const router = useRouter();
  const [refCode, setRefCode] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/unisciti"); return; }

      const [{ data: profile }, { data: refCount }] = await Promise.all([
        supabase.from("profiles").select("referral_code").eq("id", user.id).single(),
        supabase.rpc("referral_count"),
      ]);

      if (!profile) { router.replace("/unisciti"); return; }
      setRefCode(profile.referral_code as string);
      setCount(refCount as number ?? 0);
    })();
  }, [router]);

  const link = refCode ? `${typeof window !== "undefined" ? window.location.origin : ""}/unisciti?ref=${refCode}` : "";

  async function handleCopy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (navigator.share) {
      await navigator.share({ title: "1% — not for everyone", text: "Sei dell'1%?", url: link });
    } else {
      handleCopy();
    }
  }

  if (!refCode) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="font-display text-brand-red text-6xl animate-pulse-glow">1%</div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-sm mx-auto">
      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-2">porta un altro</p>
      <h1 className="font-display text-brand-red text-6xl mb-2">1%</h1>
      <p className="text-white text-lg mb-10">
        Hai già portato{" "}
        <span className="text-brand-red font-semibold">{count}</span>{" "}
        {count === 1 ? "persona" : "persone"} nell&apos;1%.
      </p>

      <div className="w-full border border-white/10 px-4 py-3 mb-4 text-left">
        <p className="text-xs text-brand-gray uppercase tracking-widest mb-1">Il tuo link</p>
        <p className="text-sm text-white break-all font-mono">{link}</p>
      </div>

      <div className="w-full flex flex-col gap-3">
        <button
          onClick={handleShare}
          className="btn btn-primary w-full"
        >
          Condividi
        </button>
        <button
          onClick={handleCopy}
          className="btn btn-ghost w-full"
        >
          {copied ? "Copiato ✓" : "Copia link"}
        </button>
      </div>

      <button
        onClick={() => router.push("/card")}
        className="mt-8 text-xs uppercase tracking-widest text-brand-gray/50 hover:text-brand-gray transition-colors"
      >
        ← La tua card
      </button>
    </main>
  );
}
