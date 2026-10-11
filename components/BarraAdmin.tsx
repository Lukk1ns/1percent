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

  // Tasti veri, non scritte: sul telefono le parole da 11px attaccate al
  // bordo finivano nella sfumatura che Safari mette sotto l'orologio e
  // "indietro" non si riusciva a prendere col dito. 44px è l'altezza
  // minima perché un dito ci stia dentro.
  const tasto =
    "flex h-11 items-center gap-2 border px-3.5 font-tech text-xs uppercase tracking-[0.1em] transition-colors";
  const spento = "border-white/20 text-white/85 hover:border-white/50 hover:text-white";

  return (
    <>
      {/* Lo spazio che la barra occupa (tasti + margini + la tacca
          dell'iPhone): senza, il contenuto le finirebbe sotto. */}
      <div
        style={{ height: "calc(3.875rem + env(safe-area-inset-top))" }}
        aria-hidden
      />

      <div
        className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-2 px-4 py-2">
          <Link
            href={suPannello ? "/" : "/admin/dashboard"}
            className={`${tasto} ${spento}`}
          >
            <span aria-hidden>←</span>
            {suPannello ? "sito" : "pannello"}
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/posta"
              className={`${tasto} ${
                pathname.startsWith("/admin/posta")
                  ? "border-brand-red text-brand-red"
                  : spento
              }`}
            >
              posta
              {posta !== null && posta > 0 && (
                <span className="bg-brand-red px-1.5 py-0.5 text-[10px] leading-none text-white">
                  {posta}
                </span>
              )}
            </Link>

            {/* Sul pannello il sito è già il tasto a sinistra: qui sarebbe
                un doppione. Nelle altre pagine evita di passare dal pannello. */}
            {!suPannello && (
              <Link href="/" className={`${tasto} ${spento}`}>
                sito
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
