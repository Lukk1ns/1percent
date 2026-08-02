"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

export function NavBasso() {
  const pathname = usePathname();

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
          {VOCI.map((v) => {
            const attiva = v.href === "/" ? pathname === "/" : pathname.startsWith(v.href);
            return (
              <Link
                key={v.href}
                href={v.href}
                aria-current={attiva ? "page" : undefined}
                className={`relative flex-1 px-1 py-3.5 text-center font-tech text-[11px] uppercase tracking-[0.12em] transition-colors ${
                  attiva ? "text-brand-red" : "text-white/70 hover:text-white"
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
