"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { caricaFoto as spedisciFoto } from "@/lib/foto-upload";

type AlbumAdmin = {
  id: string;
  nome: string;
  slug: string;
  descrizione: string | null;
  data_serata: string | null;
  visibile_dal: string | null;
  evento: string | null;
  event_id: string | null;
  foto: number;
  rimozioni: number;
};

type FotoAdmin = { id: string; thumb: string; width: number | null; height: number | null; rimozioni: number };

/** Da "SUMMER END 2026" a "summer-end-2026". */
function inIndirizzo(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Gli album delle serate.
 *
 * Il caricamento va a una foto per volta, non tutte insieme: trecento
 * foto in un colpo solo farebbero cadere la richiesta a metà, e non si
 * saprebbe quali sono arrivate. Così invece si vede la barra salire e,
 * se una fallisce, le altre continuano.
 */
export default function AdminFotoPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [autorizzato, setAutorizzato] = useState<boolean | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [albums, setAlbums] = useState<AlbumAdmin[]>([]);
  const [scelto, setScelto] = useState<string | null>(null);
  const [foto, setFoto] = useState<FotoAdmin[]>([]);

  const [nuovoNome, setNuovoNome] = useState("");
  const [nuovaData, setNuovaData] = useState("");

  const [caricamento, setCaricamento] = useState<{ fatte: number; totali: number } | null>(null);
  const [falliti, setFalliti] = useState<string[]>([]);

  const caricaAlbums = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_albums");
    if (error) {
      setErrore(
        "Galleria non installata sul database: incolla supabase/17_galleria.sql. (" +
          error.message +
          ")",
      );
      return;
    }
    setAlbums(data ?? []);
  }, []);

  const caricaFoto = useCallback(async (slug: string) => {
    const supabase = createClient();
    const { data } = await supabase.rpc("admin_album_foto", { p_slug: slug });
    setFoto(data ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: isAdmin } = await supabase.rpc("is_admin");
      if (!isAdmin) {
        router.replace("/admin/login");
        return;
      }
      setAutorizzato(true);
      await caricaAlbums();
    })();
  }, [router, caricaAlbums]);

  const album = albums.find((a) => a.id === scelto) ?? null;

  useEffect(() => {
    if (album) caricaFoto(album.slug);
  }, [album, caricaFoto]);

  async function creaAlbum() {
    if (!nuovoNome.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_album_salva", {
      p_id: null,
      p_nome: nuovoNome.trim(),
      p_slug: inIndirizzo(nuovoNome),
      p_event: null,
      p_data: nuovaData || null,
      p_descr: null,
    });
    if (error) {
      window.alert(error.message);
      return;
    }
    setNuovoNome("");
    setNuovaData("");
    await caricaAlbums();
    setScelto(data as string);
  }

  async function caricaFile(lista: FileList) {
    if (!album) return;
    const files = Array.from(lista);
    setCaricamento({ fatte: 0, totali: files.length });
    setFalliti([]);

    // Le foto vengono rimpicciolite nel browser e spedite quattro alla
    // volta: trecento scatti da reflex passano da ore a qualche minuto.
    const esiti = await spedisciFoto(files, album.id, (fatte, totali) =>
      setCaricamento({ fatte, totali }),
    );

    setFalliti(
      esiti.filter((e) => !e.ok).map((e) => `${e.nome}: ${e.errore ?? "non caricata"}`),
    );

    if (fileRef.current) fileRef.current.value = "";
    await caricaAlbums();
    await caricaFoto(album.slug);
    setCaricamento(null);
  }

  async function pubblica(a: AlbumAdmin) {
    const acceso = Boolean(a.visibile_dal);
    if (
      !window.confirm(
        acceso
          ? `Nascondere "${a.nome}"? Sparisce dalla galleria per tutti.`
          : `Pubblicare "${a.nome}"?\n\nDa quel momento chi si iscrive vede le ${a.foto} foto e può scaricarle.`,
      )
    )
      return;
    const supabase = createClient();
    await supabase.rpc("admin_album_pubblica", { p_id: a.id, p_pubblica: !acceso });
    await caricaAlbums();
  }

  async function togliFoto(f: FotoAdmin) {
    const motivo = window.prompt("Perché la togli? (resta scritto, la foto non si cancella)", "");
    if (motivo === null) return;
    const supabase = createClient();
    await supabase.rpc("admin_foto_togli", { p_id: f.id, p_motivo: motivo });
    if (album) await caricaFoto(album.slug);
    await caricaAlbums();
  }

  if (autorizzato === null) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="font-display text-6xl text-brand-red animate-pulse-glow">1%</div>
      </main>
    );
  }

  if (errore) {
    return (
      <main className="flex-1 px-5 py-12">
        <div className="mx-auto max-w-lg border border-brand-red/40 px-5 py-6">
          <p className="text-sm leading-relaxed text-white">{errore}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 px-5 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/admin/dashboard"
          className="font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray hover:text-white"
        >
          ← pannello
        </Link>

        <h1 className="mt-4 font-display text-4xl uppercase leading-none text-white">Foto</h1>
        <p className="mt-2 text-xs leading-relaxed text-brand-gray">
          Le foto delle serate. Per vederle bisogna essere iscritti: è il motivo per cui
          uno lascia la mail.
        </p>

        {/* Nuovo album */}
        <div className="mt-6 border border-white/10 px-4 py-4">
          <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
            nuovo album
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              placeholder="nome della serata"
              value={nuovoNome}
              onChange={(e) => setNuovoNome(e.target.value)}
              className="min-w-[10rem] flex-1 border-b border-white/20 bg-transparent pb-2 text-sm text-white placeholder-brand-gray/50 outline-none focus:border-brand-red"
            />
            <input
              type="date"
              value={nuovaData}
              onChange={(e) => setNuovaData(e.target.value)}
              className="border-b border-white/20 bg-transparent pb-2 text-sm text-white outline-none focus:border-brand-red"
            />
          </div>
          <button
            onClick={creaAlbum}
            disabled={!nuovoNome.trim()}
            className="mt-4 bg-brand-red px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-white disabled:opacity-40"
          >
            crea
          </button>
        </div>

        {/* Gli album */}
        <div className="mt-6 flex flex-col gap-2">
          {albums.map((a) => (
            <div key={a.id} className="border border-white/10">
              <button
                onClick={() => setScelto(scelto === a.id ? null : a.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-lg uppercase leading-none text-white">
                    {a.nome}
                  </p>
                  <p className="mt-1.5 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                    {a.foto} foto ·{" "}
                    {a.visibile_dal ? (
                      <span className="text-emerald-400">pubblicato</span>
                    ) : (
                      <span className="text-amber-300">non pubblicato</span>
                    )}
                    {a.rimozioni > 0 && (
                      <span className="ml-2 text-brand-red">{a.rimozioni} da togliere</span>
                    )}
                  </p>
                </div>
                <span className="flex-shrink-0 font-tech text-[10px] text-brand-gray">
                  {scelto === a.id ? "▲" : "▼"}
                </span>
              </button>

              {scelto === a.id && (
                <div className="border-t border-white/10 px-4 py-4">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) caricaFile(e.target.files);
                    }}
                  />

                  <p className="mb-3 text-[11px] leading-relaxed text-brand-gray/70">
                    Selezionale tutte insieme: vengono rimpicciolite qui sul computer e
                    spedite quattro alla volta. Una foto da reflex parte da 10 MB e arriva
                    a mezzo, quindi ci mette un attimo invece di un minuto.
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={Boolean(caricamento)}
                      className="border border-white/20 px-4 py-3 font-tech text-[10px] uppercase tracking-[0.2em] text-white transition-colors hover:border-brand-red disabled:opacity-40"
                    >
                      {caricamento ? "sto caricando…" : "aggiungi foto"}
                    </button>
                    <button
                      onClick={() => pubblica(a)}
                      disabled={Boolean(caricamento) || a.foto === 0}
                      className={`border px-4 py-3 font-tech text-[10px] uppercase tracking-[0.2em] transition-colors disabled:opacity-40 ${
                        a.visibile_dal
                          ? "border-emerald-400/50 text-emerald-300"
                          : "border-brand-red bg-brand-red/10 text-white"
                      }`}
                    >
                      {a.visibile_dal ? "nascondi" : "pubblica"}
                    </button>
                    {a.visibile_dal && (
                      <Link
                        href={`/foto/${a.slug}`}
                        target="_blank"
                        className="border border-white/10 px-4 py-3 font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray hover:text-white"
                      >
                        guarda
                      </Link>
                    )}
                  </div>

                  {caricamento && (
                    <div className="mt-4">
                      <div className="h-1.5 w-full bg-white/10">
                        <div
                          className="h-full bg-brand-red transition-all"
                          style={{
                            width: `${(caricamento.fatte / caricamento.totali) * 100}%`,
                          }}
                        />
                      </div>
                      <p className="mt-2 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                        {caricamento.fatte} di {caricamento.totali} · quattro alla volta ·
                        non chiudere la pagina
                      </p>
                    </div>
                  )}

                  {falliti.length > 0 && (
                    <div className="mt-4 border border-brand-red/40 px-3 py-3">
                      <p className="font-tech text-[10px] uppercase tracking-[0.15em] text-brand-red">
                        {falliti.length} non caricate
                      </p>
                      <ul className="mt-2 flex flex-col gap-1">
                        {falliti.slice(0, 8).map((f) => (
                          <li key={f} className="text-[11px] text-brand-gray">
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {foto.length > 0 && (
                    <div className="mt-5 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                      {foto.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => togliFoto(f)}
                          title="Togli questa foto"
                          className={`group relative aspect-square overflow-hidden bg-white/[0.03] ${
                            f.rimozioni > 0 ? "ring-2 ring-brand-red" : ""
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/foto/${f.id}?f=thumb`}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/70 font-tech text-[9px] uppercase tracking-[0.15em] text-white opacity-0 transition-opacity group-hover:opacity-100">
                            togli
                          </span>
                          {f.rimozioni > 0 && (
                            <span className="absolute left-1 top-1 bg-brand-red px-1.5 py-0.5 font-tech text-[8px] uppercase text-white">
                              segnalata
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {albums.length === 0 && (
            <p className="border border-white/10 px-4 py-8 text-center text-[12px] text-brand-gray">
              Nessun album. Creane uno qui sopra e poi carica le foto.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
