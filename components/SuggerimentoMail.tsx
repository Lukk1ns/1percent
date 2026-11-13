"use client";

import { correggiMail, mailCompleta, pulisciMail } from "@/lib/mail";

/**
 * Sotto la casella della mail: "Intendevi nome@gmail.com?" con un tocco
 * per correggere (13 nov 2026, i codici che finivano nel nulla).
 * Con `onConferma` c'è anche "no, è giusta", per le mail strane ma vere.
 */
export function SuggerimentoMail({
  email,
  onCorreggi,
  onConferma,
  confermata,
}: {
  email: string;
  onCorreggi: (giusta: string) => void;
  onConferma?: (m: string) => void;
  confermata?: string | null;
}) {
  const m = pulisciMail(email);
  const giusta = m.includes("@") ? correggiMail(m) : null;
  if (!giusta || m === confermata) return null;

  return (
    <div className="border border-amber-400/50 bg-amber-400/10 px-3 py-2.5 text-left">
      <p className="text-[12px] leading-snug text-white">
        Intendevi <strong className="break-all text-amber-200">{giusta}</strong>?
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => onCorreggi(giusta)}
          className="bg-amber-300 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-black"
        >
          sì, correggi
        </button>
        {onConferma && mailCompleta(m) && (
          <button
            type="button"
            onClick={() => onConferma(m)}
            className="border border-white/20 px-3 py-1.5 text-[11px] uppercase tracking-wider text-brand-gray"
          >
            no, è giusta
          </button>
        )}
      </div>
    </div>
  );
}
