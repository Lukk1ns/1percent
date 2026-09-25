"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * La riga in cima al pannello.
 *
 * Nasce da due richieste di Luka nello stesso giorno: *"nell'area admin
 * mi serve anche un collegamento alla homepage"* e *"un posto dove si
 * raccolgono i messaggi e le lamentele"*. Prima metà delle pagine del
 * pannello non riportava da nessuna parte: l'indirizzo andava scritto a
 * mano, come era già successo con l'area PR.
 *
 * Sta nel layout di `/admin`, quindi vale per tutte le pagine — anche
 * quelle che verranno. Si toglie di mezzo dove darebbe fastidio: la
 * porta lavora a tutto schermo con una mano sola, il login non ha
 * ancora nessuno da salutare.
 */

const FUORI = ["/admin/login", "/admin/porta", "/admin/scan"];

export function BarraAdmin() {
  const pathname = usePathname() ?? "";
  const [posta, setPosta] = useState<number | null>(null);

  const nascosta = FUORI.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (nascosta) return;
    createClient()
      .rpc("admin_notifiche")
      .then(({ data, error }) => {
        // Finché 33_posta_admin.sql non è incollato non c'è nessun
        // numero da mostrare: il link resta, il pallino no.
        if (!error) setPosta(Number(data?.[0]?.totale ?? 0));
      });
  }, [nascosta, pathname]);

  if (nascosta) return null;

  const suPannello = pathname === "/admin/dashboard";

  return (
    <>
      {/* Lo spazio che la barra occupa: senza, il contenuto le finirebbe
          sotto e si intravedrebbe attraverso, che è quello che succedeva
          quando era "sticky" e mezza trasparente. */}
      <div className="h-[2.85rem]" aria-hidden />

      <div
        className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-2 px-4 py-2.5">
          <Link
            href={suPannello ? "/" : "/admin/dashboard"}
            className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray transition-colors hover:text-white"
          >
            {suPannello ? "← il sito" : "← pannello"}
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/admin/posta"
              className={`relative font-tech text-[10px] uppercase tracking-[0.2em] transition-colors ${
                pathname.startsWith("/admin/posta")
                  ? "text-brand-red"
                  : "text-brand-gray hover:text-white"
              }`}
            >
              posta
              {posta !== null && posta > 0 && (
                <span className="ml-1.5 bg-brand-red px-1.5 py-0.5 text-[9px] text-white">
                  {posta}
                </span>
              )}
            </Link>

            <Link
              href="/"
              className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray transition-colors hover:text-white"
            >
              sito ↗
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
