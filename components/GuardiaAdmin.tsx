"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * La porta del pannello.
 *
 * Trovata da Luka il 25 settembre 2026 provando il sito dal telefono:
 * dallo scanner si finiva sull'accesso staff, e **bastava una mail
 * qualsiasi** per ritrovarsi dentro la dashboard, con eventi da creare e
 * candidature da approvare. Il motivo: `/admin/dashboard`, `/admin/eventi`,
 * `/admin/crew` e `/admin/scan` non controllavano niente — si fidavano
 * del fatto che le funzioni del database rifiutano gli estranei. È vero
 * (i dati non uscivano e i tasti non avrebbero funzionato), ma vedere il
 * pannello di comando non deve capitare: chi lo vede prova, e chi prova
 * a volte trova.
 *
 * Adesso il controllo sta **nel layout**, quindi vale per ogni pagina del
 * pannello, anche quelle che verranno. Due livelli:
 *   · porta e scanner → staff (admin, operatori, account manager);
 *   · tutto il resto  → solo admin.
 *
 * Chi non ha i permessi non viene rimbalzato sull'accesso staff — era
 * quello a far sembrare che bastasse entrare per avere i diritti, e a
 * creare il giro infinito — ma trova una porta chiusa con il ritorno al sito.
 */

const LIBERE = ["/admin/login"];
const DA_STAFF = ["/admin/porta", "/admin/scan"];

type Esito = "controllo" | "dentro" | "fuori";

export function GuardiaAdmin({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [esito, setEsito] = useState<Esito>("controllo");

  const libera = LIBERE.some((p) => pathname.startsWith(p));
  const bastaStaff = DA_STAFF.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (libera) {
      setEsito("dentro");
      return;
    }

    let vivo = true;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (vivo) setEsito("fuori");
        return;
      }

      const { data: admin } = await supabase.rpc("is_admin");
      if (admin) {
        if (vivo) setEsito("dentro");
        return;
      }

      if (bastaStaff) {
        const [{ data: staff }, { data: manager }] = await Promise.all([
          supabase.rpc("is_staff"),
          supabase.rpc("is_account_manager"),
        ]);
        if (vivo) setEsito(staff || manager ? "dentro" : "fuori");
        return;
      }

      if (vivo) setEsito("fuori");
    })();

    return () => {
      vivo = false;
    };
  }, [pathname, libera, bastaStaff]);

  if (esito === "controllo") {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="font-display text-6xl text-brand-red animate-pulse-glow">1%</div>
      </main>
    );
  }

  if (esito === "fuori") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 font-display text-6xl text-brand-red">%</div>
        <h1 className="mb-3 text-xl font-semibold text-white">Area riservata</h1>
        <p className="max-w-xs text-sm leading-relaxed text-brand-gray">
          Questa parte è di chi gestisce le serate. Se ti serve entrarci, parlane con Luka.
        </p>
        <Link
          href="/"
          className="mt-8 border border-white/20 px-5 py-3 font-tech text-[11px] uppercase tracking-[0.25em] text-white transition-colors hover:border-brand-red"
        >
          torna al sito →
        </Link>
        <button
          onClick={() => router.push("/admin/login")}
          className="mt-4 font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray/60 hover:text-white"
        >
          entra con un altro account
        </button>
      </main>
    );
  }

  return <>{children}</>;
}
