"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TornaA } from "@/components/Torna";
import { createClient } from "@/lib/supabase/client";
import { NavBasso } from "@/components/NavBasso";

type Foto = {
  id: string;
  thumb: string;
  medium: string;
  width: number | null;
  height: number | null;
};

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
 * Un album.
 *
 * Chi non è iscritto trova la porta: nome della serata, quante foto ci
 * sono, e l'invito a entrare. Le immagini non gli arrivano nemmeno
 * chiedendole al server — il permesso lo decide il database.
 *
 * Chi è dentro vede la griglia, apre una foto a schermo pieno e la
 * scarica in alta qualità.
 */
export default function AlbumPage({ params }: { params: Promise<{ album: string }> }) {
  const { album: slug } = use(params);

  const [album, setAlbum] = useState<Album | null>(null);
  const [foto, setFoto] = useState<Foto[]>([]);
  const [iscritto, setIscritto] = useState(false);
  const [caricato, setCaricato] = useState(false);
  const [aperta, setAperta] = useState<number | null>(null);
  const [scaricando, setScaricando] = useState(false);
  const [segnalata, setSegnalata] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [aRes, iRes] = await Promise.all([
        supabase.rpc("albums_pubblici"),
        supabase.rpc("sono_iscritto"),
      ]);

      const mio = (aRes.data ?? []).find((x: Album) => x.slug === slug) ?? null;
      setAlbum(mio);

      const dentro = Boolean(iRes.data);
      setIscritto(dentro);

      if (dentro && mio) {
        const { data } = await supabase.rpc("album_foto", { p_slug: slug });
        setFoto(data ?? []);
      }
      setCaricato(true);
    })();
  }, [slug]);

  // Frecce e ESC: sfogliare con la tastiera, da computer
  useEffect(() => {
    if (aperta === null) return;
    function tasto(e: KeyboardEvent) {
      if (e.key === "Escape") setAperta(null);
      if (e.key === "ArrowRight") setAperta((i) => (i === null ? null : Math.min(i + 1, foto.length - 1)));
      if (e.key === "ArrowLeft") setAperta((i) => (i === null ? null : Math.max(i - 1, 0)));
    }
    window.addEventListener("keydown", tasto);
    return () => window.removeEventListener("keydown", tasto);
  }, [aperta, foto.length]);

  /**
   * Salvare una foto dal telefono non è come salvarla dal computer.
   *
   * Sul computer basta un collegamento con "download" e il file finisce
   * nella cartella. **Su iPhone quel meccanismo non salva niente**: apre
   * l'immagine in un'altra scheda, e chi guarda pensa che sia rotto. In
   * più le nostre foto sono in formato webp, che l'app Foto di iPhone
   * non prende volentieri.
   *
   * Quindi: la foto viene riportata in JPEG qui nel telefono, e poi
   * passata al foglio di condivisione del sistema — quello con "Salva
   * immagine", il gesto che la gente conosce. Dove quel foglio non
   * esiste (i computer) si torna al salvataggio di sempre.
   */
  const scarica = useCallback(
    async (f: Foto) => {
      setScaricando(true);
      try {
        const res = await fetch(`/api/foto/${f.id}?f=hd`);
        if (!res.ok) throw new Error("foto non disponibile");
        const originale = await res.blob();
        const nome = `1percento-${slug}-${f.id.slice(0, 8)}.jpg`;

        // webp → jpeg, il formato che tutti i telefoni mettono in galleria
        const jpeg = await new Promise<Blob>((risolvi, rifiuta) => {
          const img = new Image();
          const src = URL.createObjectURL(originale);
          img.onload = () => {
            const tela = document.createElement("canvas");
            tela.width = img.naturalWidth;
            tela.height = img.naturalHeight;
            const ctx = tela.getContext("2d");
            if (!ctx) return rifiuta(new Error("niente canvas"));
            ctx.drawImage(img, 0, 0);
            tela.toBlob(
              (b) => {
                URL.revokeObjectURL(src);
                b ? risolvi(b) : rifiuta(new Error("conversione fallita"));
              },
              "image/jpeg",
              0.92,
            );
          };
          img.onerror = () => {
            URL.revokeObjectURL(src);
            rifiuta(new Error("immagine illeggibile"));
          };
          img.src = src;
        }).catch(() => originale); // se qualcosa va storto, si salva il webp

        const file = new File([jpeg], nome, { type: jpeg.type || "image/jpeg" });

        // Il foglio di condivisione del telefono: lì dentro c'è "Salva immagine"
        const nav = navigator as Navigator & {
          canShare?: (d: { files: File[] }) => boolean;
        };
        if (nav.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
            return;
          } catch (e) {
            // "Annulla" non è un errore: non si insiste con altri modi
            if ((e as Error)?.name === "AbortError") return;
          }
        }

        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = nome;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      } catch {
        window.alert(
          "Non sono riuscito a salvarla.\n\nProva così: tieni premuto sulla foto qui sopra e scegli \"Salva immagine\".",
        );
      } finally {
        setScaricando(false);
      }
    },
    [slug],
  );

  async function segnala(f: Foto) {
    const motivo = window.prompt(
      "Vuoi che togliamo questa foto?\n\nScrivi due righe: chi sei e perché. La guardiamo e ti rispondiamo.",
      "",
    );
    if (motivo === null) return;
    const supabase = createClient();
    await supabase.rpc("chiedi_rimozione", { p_photo: f.id, p_motivo: motivo });
    setSegnalata(f.id);
  }

  if (!caricato) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="font-display text-6xl text-brand-red animate-pulse-glow">1%</div>
      </main>
    );
  }

  if (!album) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 font-display text-6xl text-brand-red">%</div>
        <h1 className="mb-3 text-xl font-semibold text-white">Album non trovato</h1>
        <TornaA
          a="/foto"
          etichetta="← tutte le serate"
          className="mt-6 font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray hover:text-white"
        />
      </main>
    );
  }

  // La porta: sei arrivato fin qui, manca un passo
  if (!iscritto) {
    return (
      <main className="flex-1 px-5 py-14">
        <div className="mx-auto w-full max-w-sm text-center">
          <p className="font-tech text-[10px] uppercase tracking-[0.35em] text-brand-gray">
            {album.data_serata
              ? new Date(album.data_serata).toLocaleDateString("it-IT", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "la serata"}
          </p>
          <h1 className="mt-2 font-display text-4xl uppercase leading-none text-white">
            {album.nome}
          </h1>

          <div className="mt-8 border border-white/10 px-5 py-8">
            <p className="font-display text-6xl leading-none text-brand-red">{album.foto}</p>
            <p className="mt-2 font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">
              foto di quella sera
            </p>
            <p className="mt-5 text-[13px] leading-relaxed text-white">
              Ci sei anche tu, probabilmente.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-brand-gray">
              Per vederle serve un account. Trenta secondi, nessuna password: metti un nome
              e la tua mail. Poi le guardi tutte e ti scarichi le tue.
            </p>

            <Link
              href={`/unisciti?next=/foto/${album.slug}`}
              className="mt-6 block w-full bg-brand-red py-4 text-sm font-semibold uppercase tracking-widest text-white"
            >
              entra e guardale
            </Link>
            <Link
              href={`/login?next=/foto/${album.slug}`}
              className="mt-3 block w-full py-3 font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray hover:text-white"
            >
              sono già dei vostri →
            </Link>
          </div>

          <TornaA
            a="/foto"
            etichetta="← le altre serate"
            className="mt-8 inline-block font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray hover:text-white"
          />
        </div>
      </main>
    );
  }

  const corrente = aperta !== null ? foto[aperta] : null;

  return (
    <main className="flex-1 px-4 py-8">
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="mt-4 font-display text-4xl uppercase leading-none text-white">
          {album.nome}
        </h1>
        <p className="mt-2 font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray">
          {album.data_serata
            ? new Date(album.data_serata).toLocaleDateString("it-IT", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : ""}
          {foto.length > 0 ? ` · ${foto.length} foto` : ""}
        </p>

        {foto.length === 0 ? (
          <p className="mt-8 border border-white/10 px-5 py-10 text-center text-sm text-brand-gray">
            Le foto stanno arrivando. Torna fra poco.
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
            {foto.map((f, i) => (
              <button
                key={f.id}
                onClick={() => setAperta(i)}
                className="group relative aspect-square overflow-hidden bg-white/[0.03]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/foto/${f.id}?f=thumb`}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </button>
            ))}
          </div>
        )}

        <p className="mt-10 text-center text-[11px] leading-relaxed text-brand-gray/50">
          Se in una foto ci sei tu e non ti va, aprila e scrivici: la togliamo.
        </p>
      </div>

      {/* A schermo pieno */}
      {corrente && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/95"
          onClick={() => setAperta(null)}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
              {(aperta ?? 0) + 1} / {foto.length}
            </span>
            <button
              onClick={() => setAperta(null)}
              className="px-3 py-2 font-tech text-[11px] uppercase tracking-[0.2em] text-white"
            >
              chiudi ✕
            </button>
          </div>

          {/* min-h-0: senza, questa fascia si allarga fino a contenere
              la foto intera invece di stringerla, e su uno schermo
              grande la foto esce sotto ai bordi (Luka, 23 set). Con
              min-h-0 la fascia prende lo spazio che resta e
              max-h-full dell'immagine misura quello. */}
          <div
            className="relative flex min-h-0 flex-1 items-center justify-center px-2"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/foto/${corrente.id}?f=medium`}
              alt=""
              className="max-h-full max-w-full object-contain"
            />

            {aperta !== null && aperta > 0 && (
              <button
                onClick={() => setAperta(aperta - 1)}
                className="absolute left-0 top-1/2 -translate-y-1/2 px-4 py-8 text-3xl text-white/60 hover:text-white"
                aria-label="Foto precedente"
              >
                ‹
              </button>
            )}
            {aperta !== null && aperta < foto.length - 1 && (
              <button
                onClick={() => setAperta(aperta + 1)}
                className="absolute right-0 top-1/2 -translate-y-1/2 px-4 py-8 text-3xl text-white/60 hover:text-white"
                aria-label="Foto successiva"
              >
                ›
              </button>
            )}
          </div>

          <p className="px-6 pt-2 text-center text-[10px] leading-relaxed text-white/40">
            Dal telefono puoi anche tenere premuto sulla foto e scegliere
            &quot;Salva immagine&quot;.
          </p>

          <div
            className="flex flex-wrap items-center justify-center gap-2 px-4 py-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => scarica(corrente)}
              disabled={scaricando}
              className="bg-brand-red px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-white disabled:opacity-50"
            >
              {scaricando ? "preparo la foto…" : "salva la foto"}
            </button>
            <button
              onClick={() => segnala(corrente)}
              className="border border-white/15 px-4 py-3.5 font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray hover:text-white"
            >
              {segnalata === corrente.id ? "richiesta inviata" : "ci sono io, toglietela"}
            </button>
          </div>
        </div>
      )}
    
      <NavBasso />
    </main>
  );
}
