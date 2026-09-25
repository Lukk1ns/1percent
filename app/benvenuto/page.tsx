"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Locandina from "@/components/Locandina";
import { createClient } from "@/lib/supabase/client";
import { getAvatar } from "@/lib/avatars";
import { dataLunga, ora, type Evento } from "@/lib/eventi";

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
  // Chi si è iscritto per vedere le foto ci torna direttamente
  const [dove, setDove] = useState("/");
  // "Un utente nuovo che si iscrive per vedere le foto dell'ultimo
  // evento deve sbattere sul prossimo evento" (Luka, 25 set): è il
  // momento in cui sta guardando lo schermo, e l'unico in cui gli
  // stiamo parlando. Le foto restano lì sotto, un tocco più in là.
  const [evento, setEvento] = useState<Evento | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("member_data");
    if (!raw) { router.replace("/unisciti"); return; }
    setMember(JSON.parse(raw));

    const next = sessionStorage.getItem("reg_next");
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      setDove(next);
      sessionStorage.removeItem("reg_next");
    }

    createClient()
      .rpc("next_event")
      .then(({ data, error }) => {
        if (!error && data) setEvento(data as Evento);
      });

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

          {/* Il prossimo evento, prima di tutto il resto */}
          {evento && !evento.passato && (
            <div className="mt-2 w-full max-w-[17rem] border border-brand-red/40 bg-brand-red/5 px-4 py-4">
              <p className="font-tech text-[10px] uppercase tracking-[0.3em] text-brand-red">
                la prossima
              </p>

              {evento.svelato ? (
                <>
                  {evento.cover_key && (
                    <Locandina
                      coverKey={evento.cover_key}
                      coverV={evento.cover_v}
                      nome={evento.nome}
                      className="mt-3"
                    />
                  )}
                  <p className="mt-3 font-display text-lg uppercase leading-tight text-white">
                    {evento.nome}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-brand-gray">
                    {dataLunga(evento.starts_at)} · {ora(evento.starts_at)}
                    {evento.locale ? ` · ${evento.locale}` : ""}
                  </p>
                  <Link
                    href={`/eventi/${evento.slug}`}
                    className="btn btn-primary cta-pulse mt-4 w-full"
                  >
                    Guarda la serata →
                  </Link>
                </>
              ) : (
                <>
                  <p className="mt-2 font-display text-3xl uppercase leading-none text-white">
                    ?????
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-brand-gray">
                    {dataLunga(evento.starts_at)}. Il nome lo sveliamo dopo: da dentro lo
                    saprai per primo.
                  </p>
                  <Link href="/eventi" className="btn btn-primary mt-4 w-full">
                    Le nostre serate →
                  </Link>
                </>
              )}
            </div>
          )}

          <button
            onClick={() => router.push(dove)}
            className={`mt-1 px-10 ${
              evento && !evento.passato ? "btn btn-outline" : "btn btn-primary cta-pulse mt-4"
            }`}
          >
            {dove.startsWith("/foto") ? "Guarda le foto →" : "Vai al sito →"}
          </button>
        </div>
      )}
    </main>
  );
}
