"use client";

import { useState } from "react";
import { apriChatCliente, copia, linkBiglietto, numeroCliente } from "@/lib/biglietto-cliente";

/**
 * I tre tasti per rimandare un biglietto: WhatsApp col messaggio già
 * scritto, solo il link da incollare dove si vuole, e il biglietto
 * aperto per vederlo. Stessi nella pagina del PR e nel pannello.
 *
 * Prima il PR aveva "rimanda" e "vedi" in corpo 9: non li trovava
 * nessuno, e il link da copiare non c'era proprio.
 */
export function MandaBiglietto({
  token,
  telefono,
  testo,
}: {
  token: string;
  telefono: string | null;
  /** Il messaggio intero, già con link ed eventuale delega. */
  testo: string;
}) {
  const [copiato, setCopiato] = useState(false);
  const num = numeroCliente(telefono);

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => apriChatCliente(num, testo)}
        title={num ? undefined : "Nessun numero: scegli tu la chat dentro WhatsApp"}
        className="border border-emerald-400/50 px-3 py-2.5 font-tech text-[10px] uppercase tracking-[0.15em] text-emerald-300 transition-colors hover:bg-emerald-400/10"
      >
        whatsapp
      </button>
      <button
        type="button"
        onClick={async () => {
          if (await copia(linkBiglietto(token))) {
            setCopiato(true);
            setTimeout(() => setCopiato(false), 2000);
          }
        }}
        className="border border-white/20 px-3 py-2.5 font-tech text-[10px] uppercase tracking-[0.15em] text-white transition-colors hover:border-brand-red"
      >
        {copiato ? "link copiato ✓" : "copia link"}
      </button>
      <a
        href={`/biglietto/${token}`}
        target="_blank"
        rel="noreferrer"
        className="border border-white/10 px-3 py-2.5 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray transition-colors hover:text-white"
      >
        apri
      </a>
    </div>
  );
}
