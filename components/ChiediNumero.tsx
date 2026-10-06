"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizzaNumero } from "@/lib/whatsapp";

/**
 * Il PR senza numero WhatsApp non vende (script 41, 6 ott).
 *
 * Luka: con chi si candida dal sito non aveva più una chat aperta, e
 * poteva esserci un PR che non sapeva come chiamare. Chi era già PR
 * prima del numero obbligatorio lo scrive qui, una volta sola, e passa.
 * Il blocco vero sta nel database: senza numero la prevendita non nasce.
 */
export function ChiediNumero({ onFatto }: { onFatto: () => void }) {
  const [numero, setNumero] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    const pulito = normalizzaNumero(numero);
    if (!pulito) {
      setErrore(
        numero.trim()
          ? "Il numero non è giusto. Se non è italiano, mettilo col prefisso (+385…)."
          : "Scrivi il tuo numero WhatsApp.",
      );
      return;
    }
    setSalvando(true);
    setErrore(null);
    const { error } = await createClient().rpc("set_mio_numero", { p_numero: pulito });
    setSalvando(false);
    if (error) {
      const m = error.message ?? "";
      setErrore(
        m.includes("numero_gia_usato")
          ? "Questo numero è già di un altro iscritto. Se è davvero il tuo, scrivi a Luka."
          : m.includes("numero_non_valido")
          ? "Il numero non è giusto. Se non è italiano, mettilo col prefisso (+385…)."
          : "Non è andata. Riprova.",
      );
      return;
    }
    onFatto();
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <form onSubmit={salva} className="w-full max-w-sm">
        <p className="font-tech text-[10px] uppercase tracking-[0.35em] text-brand-red">
          prima di vendere
        </p>
        <h1 className="mt-2 font-display text-4xl uppercase leading-none text-white">
          Il tuo numero WhatsApp
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-brand-gray">
          È lì che Luka ti scrive per le serate, le prevendite e i soldi da consegnare.
          Si fa <span className="text-white">una volta sola</span>, poi vai dritto alle
          prevendite.
        </p>

        <input
          type="tel"
          inputMode="tel"
          placeholder="es. 347 123 4567"
          value={numero}
          maxLength={20}
          onChange={(e) => {
            setNumero(e.target.value);
            setErrore(null);
          }}
          className="input-line mt-8 text-xl"
          autoComplete="tel"
          autoFocus
        />
        <p className="mt-2 text-[10px] uppercase tracking-widest text-brand-gray/50">
          Non compare sul sito: lo vedono solo Luka e gli account manager
        </p>

        {errore && <p className="mt-4 text-sm text-brand-red">{errore}</p>}

        <button type="submit" disabled={salvando} className="btn btn-primary mt-8 w-full">
          {salvando ? "Un attimo…" : "Salva e vai alle prevendite →"}
        </button>
      </form>
    </main>
  );
}
