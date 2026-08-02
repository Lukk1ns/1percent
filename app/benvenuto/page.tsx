"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAvatar } from "@/lib/avatars";

type MemberData = {
  member_number: number;
  alias: string;
  avatar_id: string;
  /** 'in_attesa' se si è candidato allo staff */
  crew_request_status?: string;
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
          <h1
            className="font-display text-brand-red text-5xl leading-tight"
            style={{ textShadow: "0 0 20px rgba(224,24,31,0.6), 0 0 60px rgba(224,24,31,0.3)" }}
          >
            Benvenuto
            <br />
            nell'1%
          </h1>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 animate-fade-up">
          <p className="text-xs uppercase tracking-[0.3em] text-brand-gray">
            adesso sei dentro
          </p>
          <div className="text-6xl">{avatar.emoji}</div>
          <p className="text-brand-gray text-sm">
            membro{" "}
            <span className="text-white font-semibold">
              #{String(member.member_number).padStart(4, "0")}
            </span>
          </p>
          <h2 className="font-display text-3xl text-white">{member.alias}</h2>

          {/* Chi si è candidato allo staff deve sapere cosa succede adesso */}
          {member.crew_request_status === "in_attesa" && (
            <div className="border border-brand-red/40 bg-brand-red/5 px-5 py-4 max-w-xs">
              <p className="text-xs uppercase tracking-[0.2em] text-brand-red mb-2">
                candidatura ricevuta
              </p>
              <p className="text-xs text-brand-gray leading-relaxed">
                Le tue risposte sono arrivate. Se ci interessi, ti scriviamo noi.
              </p>
            </div>
          )}

          <button
            onClick={() => router.push("/")}
            className="btn btn-primary cta-pulse mt-4 px-10"
          >
            Vai al sito →
          </button>
        </div>
      )}
    </main>
  );
}
