"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * La barra in fondo, quella che si usa davvero.
 *
 * Prima era copiata a mano in sei pagine, scritta a 10px in grigio scuro:
 * Luka ha segnalato che non la vedeva nessuno. Ora è una sola, **fissa in
 * fondo allo schermo** come in un'app, con la voce corrente in rosso.
 *
 * Si porta dietro il suo spazio (lo spaziatore qui sotto), così nessuna
 * pagina deve ricordarsi di lasciare il margine e niente finisce coperto.
 * `pb-safe` tiene conto della barra gesti dell'iPhone.
 */

const VOCI = [
  { href: "/", label: "Home" },
  { href: "/card", label: "Card" },
  { href: "/pass", label: "QR" },
  { href: "/membri", label: "Muro" },
  { href: "/profilo", label: "Profilo" },
  { href: "/invita", label: "Invita" },
];

/**
 * Chi non è iscritto non ha una card, né un QR, né un profilo: mandarlo
 * su quelle pagine vuol dire sbatterlo contro una porta chiusa. A lui la
 * barra mostra dove può andare davvero — e come entrare.
 */
const VOCI_FUORI = [
  { href: "/", label: "Home" },
  { href: "/eventi", label: "Serate" },
  { href: "/foto", label: "Foto" },
  { href: "/unisciti", label: "Entra" },
];

export function NavBasso() {
  const pathname = usePathname();
  // I PR hanno una voce in più. Non è un vezzo: fino a ieri all'area
  // prevendite non portava nessun link, e chi ci lavora doveva
  // scriversi /pr a mano — infatti nessuno la trovava.
  const [sonoPr, setSonoPr] = useState(false);
  // null = non lo so ancora: meglio non far lampeggiare voci sbagliate.
  const [dentro, setDentro] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("prevendite_stato").then(({ data }) => {
      const s = data?.[0];
      setSonoPr(Boolean(s?.sono_pr) && Boolean(s?.aperta || s?.sono_admin));
      // Un PR è dentro per definizione, anche se il profilo tardasse.
      if (s?.sono_pr || s?.sono_admin) setDentro(true);
    });
    supabase.rpc("my_profile").then(({ data }) => {
      const c = Array.isArray(data) ? data.length > 0 : Boolean(data);
      setDentro((prima) => prima || c);
    });
  }, []);

  const voci = !dentro
    ? VOCI_FUORI
    : sonoPr
      ? [...VOCI.slice(0, 1), { href: "/pr", label: "PR" }, ...VOCI.slice(1)]
      : VOCI;

  return (
    <>
      {/* Spazio sotto il contenuto: la barra è fissa e coprirebbe l'ultima riga */}
      <div className="h-[4.5rem]" aria-hidden />

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-red/25 bg-black/92 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Navigazione principale"
      >
        <div className="mx-auto flex w-full max-w-lg justify-around">
          {voci.map((v) => {
            const attiva = v.href === "/" ? pathname === "/" : pathname.startsWith(v.href);
            return (
              <Link
                key={v.href}
                href={v.href}
                aria-current={attiva ? "page" : undefined}
                className={`relative flex-1 px-1 py-3.5 text-center font-tech text-[12px] uppercase tracking-[0.06em] transition-colors ${
                  attiva ? "text-brand-red" : "text-white hover:text-white"
                }`}
              >
                {/* Tacca accesa sopra la voce corrente, come un LED della parete */}
                {attiva && (
                  <span
                    className="absolute inset-x-3 top-0 h-[2px] bg-brand-red"
                    aria-hidden
                  />
                )}
                {v.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
