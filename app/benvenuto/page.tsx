"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAvatar } from "@/lib/avatars";

type MemberData = {
  member_number: number;
  alias: string;
  avatar_id: string;
};

export default function BenvenutoPage() {
  const router = useRouter();
  const [member, setMember] = useState<MemberData | null>(null);
  const [phase, setPhase] = useState<"reveal" | "done">("reveal");

  useEffect(() => {
    const raw = sessionStorage.getItem("member_data");
    if (!raw) { router.replace("/unisciti"); return; }
    setMember(JSON.parse(raw));

    const t = setTimeout(() => setPhase("done"), 2200);
    return () => clearTimeout(t);
  }, [router]);

  if (!member) return null;

  const avatar = getAvatar(member.avatar_id);

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 text-center overflow-hidden">
      {phase === "reveal" ? (
        <div className="flex flex-col items-center animate-fade-up">
          <div className="text-7xl mb-6">{avatar.emoji}</div>
          <h1 className="font-display text-brand-red text-5xl leading-tight">
            Benvenuto
            <br />
            nell'1%
          </h1>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 animate-fade-up">
          <p className="text-xs uppercase tracking-[0.3em] text-brand-gray">
            il 99% è ancora a casa
          </p>
          <div className="text-6xl">{avatar.emoji}</div>
          <p className="text-brand-gray text-sm">
            membro{" "}
            <span className="text-white font-semibold">
              #{String(member.member_number).padStart(4, "0")}
            </span>
          </p>
          <h2 className="font-display text-3xl text-white">{member.alias}</h2>
          <button
            onClick={() => router.push("/card")}
            className="mt-4 bg-brand-red px-10 py-4 text-sm font-semibold uppercase tracking-widest text-white hover:scale-105 active:scale-95 transition-transform"
          >
            La tua card →
          </button>
        </div>
      )}
    </main>
  );
}
