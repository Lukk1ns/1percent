"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * Il tasto per tornare indietro.
 *
 * Chiesto da Luka il 24 settembre 2026: "su ogni pagina dev'esserci il
 * tasto torna indietro o torna in home". Sul telefono il gesto di
 * ritorno del browser c'è, ma una pagina aperta da un link di WhatsApp
 * non ha niente dietro: si resta lì dentro senza via d'uscita.
 *
 * Sta nel layout, quindi vale per tutte le pagine, presenti e future.
 * Le pagine che hanno già il loro ritorno scritto nel contenuto (quasi
 * tutte quelle del pannello, con "← pannello") sono elencate qui sotto:
 * lì un secondo tasto sarebbe solo un doppione.
 */

const HANNO_GIA_IL_LORO = [
  "/admin/crew",
  "/admin/eventi",
  "/admin/foto",
  "/admin/porta",
  "/admin/posta",
  "/admin/pr",
  "/admin/regali",
  "/benvenuto",
  "/candidatura",
  "/card",
  "/domande",
  "/eventi",
  "/login",
  "/privacy",
  "/profilo",
  "/tessera",
  "/u/",
  "/unisciti",
];

export function Torna() {
  const pathname = usePathname();
  const router = useRouter();

  if (!pathname || pathname === "/") return null;
  if (
    HANNO_GIA_IL_LORO.some((p) =>
      p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + "/"),
    )
  ) {
    return null;
  }

  function indietro() {
    // Se la pagina è stata aperta da un link (niente storia dietro),
    // "indietro" non porterebbe da nessuna parte: si va in home.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }

  // Sta nel flusso, non sopra la pagina: appoggiato in alto a sinistra
  // coprirebbe il titolo delle pagine che partono da lì.
  return (
    <div className="px-4 pt-4">
      <button
        onClick={indietro}
        aria-label="Torna indietro"
        className="font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray transition-colors hover:text-white"
      >
        ← indietro
      </button>
    </div>
  );
}

/**
 * Lo stesso ritorno, ma scritto dentro il contenuto di una pagina.
 *
 * Esiste per un motivo preciso: un `<Link>` che riporta "indietro"
 * **aggiunge** una tappa alla cronologia invece di toglierne una. Chi
 * entrava in un album di foto e poi tornava alla vetrina si costruiva
 * una catena vetrina → album → vetrina → album…, e il tasto indietro
 * del telefono non lo faceva più uscire: è il giro senza fine che ci
 * hanno segnalato il 24 settembre.
 */
export function TornaA({
  a,
  etichetta,
  className = "",
}: {
  a: string;
  etichetta: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(a);
      }}
      className={className}
    >
      {etichetta}
    </button>
  );
}
