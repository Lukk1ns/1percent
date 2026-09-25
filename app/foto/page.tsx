"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { NavBasso } from "@/components/NavBasso";

type Album = {
  id: string;
  nome: string;
  slug: string;
  descrizione: string | null;
  data_serata: string | null;
  foto: number;
  cover_id: string | null;
};

/**
 * Le serate in foto.
 *
 * Questa pagina la vede chiunque: è la vetrina. Si legge quali serate
 * ci sono e quante foto, ma le foto no — per quelle serve un account.
 * È il motivo per cui uno si iscrive.
 */
export default function FotoPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [iscritto, setIscritto] = useState(false);
  const [caricato, setCaricato] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [aRes, iRes] = await Promise.all([
        supabase.rpc("albums_pubblici"),
        supabase.rpc("sono_iscritto"),
      ]);
      setAlbums(aRes.data ?? []);
      setIscritto(Boolean(iRes.data));
      setCaricato(true);
    })();
  }, []);

  if (!caricato) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="font-display text-6xl text-brand-red animate-pulse-glow">1%</div>
      </main>
    );
  }

  return (
    <main className="flex-1 px-5 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <p className="font-tech text-[10px] uppercase tracking-[0.35em] text-brand-gray">
          le serate
        </p>
        <h1 className="mt-2 font-display text-5xl uppercase leading-none text-white">Foto</h1>

        {!iscritto && (
          <div className="mt-6 border border-brand-red/40 bg-brand-red/5 px-5 py-5">
            <p className="font-display text-xl uppercase leading-none text-white">
              Le foto le vedono i nostri
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-brand-gray">
              Iscriviti: ci metti trenta secondi, e da lì le guardi tutte e te le scarichi
              in alta qualità. Gratis, per sempre.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/unisciti?next=/foto"
                className="bg-brand-red px-5 py-3 text-[11px] font-semibold uppercase tracking-widest text-white"
              >
                iscriviti →
              </Link>
              <Link
                href="/login?next=/foto"
                className="border border-white/20 px-5 py-3 font-tech text-[10px] uppercase tracking-[0.2em] text-white"
              >
                sono già dei vostri
              </Link>
            </div>
          </div>
        )}

        {albums.length === 0 ? (
          <p className="mt-8 border border-white/10 px-5 py-10 text-center text-sm text-brand-gray">
            Ancora niente da vedere. Torna dopo la prossima.
          </p>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {albums.map((a) => (
              <Link
                key={a.id}
                href={`/foto/${a.slug}`}
                className="group relative block overflow-hidden border border-white/10 bg-white/[0.02]"
              >
                <div className="flex aspect-[4/3] items-center justify-center bg-black">
                  {a.cover_id && iscritto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/foto/${a.cover_id}?f=thumb`}
                      alt=""
                      className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
                    />
                  ) : (
                    <span className="font-display text-5xl text-white/10">1%</span>
                  )}
                </div>
                <div className="px-4 py-4">
                  <p className="font-display text-xl uppercase leading-none text-white">
                    {a.nome}
                  </p>
                  <p className="mt-1.5 font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
                    {a.data_serata
                      ? new Date(a.data_serata).toLocaleDateString("it-IT", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })
                      : ""}
                    {a.foto > 0 ? ` · ${a.foto} foto` : ""}
                  </p>
                  {a.descrizione && (
                    <p className="mt-2 text-[12px] leading-relaxed text-brand-gray/80">
                      {a.descrizione}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    
      <NavBasso />
    </main>
  );
}
