"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Chiave del ricordo: un annuncio a testa, non a ogni pagina aperta. */
const VISTO = "crew_approvazione_vista";

/**
 * L'annuncio dell'approvazione.
 *
 * Chi si candida allo staff resta pubblico finché un admin non decide.
 * Quando lo fa, nessuna mail parte (è Luka che scrive a chi gli interessa):
 * quindi il "sei dentro" glielo diamo qui, la prima volta che riapre il sito
 * da approvato. Poi non si rivede più — il ricordo sta nel telefono, e se
 * cambia telefono lo rivede una volta sola. Meglio due volte che mai.
 *
 * Chi è stato rifiutato non vede niente, per scelta: resta pubblico e non
 * gli si dice nulla.
 *
 * Sta nel layout, quindi vale su qualunque pagina. Se non è loggato, non è
 * membro o la colonna non c'è ancora, sta zitto.
 */
export function StatoCrew() {
  const router = useRouter();
  const [alias, setAlias] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("alias,role")
        .eq("id", user.id)
        .single();
      if (error || !data || data.role !== "crew") return;

      // Già festeggiato su questo telefono: non lo ripetiamo
      if (localStorage.getItem(VISTO) === user.id) return;
      setAlias(data.alias as string);
    })();
  }, []);

  const chiudi = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) localStorage.setItem(VISTO, user.id);
    setAlias(null);
  }, []);

  const vaiAllaTessera = useCallback(async () => {
    await chiudi();
    router.push("/tessera");
  }, [chiudi, router]);

  if (!alias) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/92 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal
    >
      <div className="w-full max-w-sm border border-brand-red/50 bg-black px-7 py-9 text-center shadow-[0_0_80px_rgba(224,24,31,0.35)]">
        <p className="font-tech text-[10px] uppercase tracking-[0.35em] text-brand-red">
          candidatura approvata
        </p>

        <p
          className="mt-5 font-display uppercase leading-none text-white"
          style={{ fontSize: "clamp(2rem,11vw,3rem)" }}
        >
          Sei della
          <br />
          <span className="text-brand-red">crew</span>
        </p>

        <p className="mt-5 text-sm leading-relaxed text-brand-gray">
          Ti abbiamo preso, <span className="text-white">{alias}</span>. Da adesso hai la
          tua tessera: ogni persona che porti e che si presenta davvero accende una
          stella.
        </p>

        <button onClick={vaiAllaTessera} className="btn btn-primary mt-7 w-full">
          Vedi la tua tessera →
        </button>
        <button
          onClick={chiudi}
          className="mt-3 font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray/70 hover:text-white"
        >
          dopo
        </button>
      </div>
    </div>
  );
}
