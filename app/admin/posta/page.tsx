"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * La posta del pannello.
 *
 * Un posto solo per tutto quello che aspetta una risposta: chi chiede di
 * togliere una sua foto, chi segnala qualcuno, chi si candida allo staff,
 * i post-it della bacheca da approvare.
 *
 * Il motivo per cui è nata: le richieste di rimozione foto **non si
 * potevano leggere da nessuna parte**. La persona scriveva "in questa
 * foto ci sono io e non mi va", finiva in tabella, e lì restava.
 */

type Rimozione = {
  id: string;
  photo_id: string;
  album: string;
  album_slug: string;
  chi: string | null;
  numero: number | null;
  motivo: string | null;
  stato: string;
  quando: string;
  chiusa_da: string | null;
};

type Segnalazione = {
  id: string;
  reporter_alias: string;
  reported_alias: string;
  reported_number: number | null;
  reason: string | null;
  status: string;
  created_at: string;
};

type Candidatura = {
  id: string;
  alias: string;
  nome: string | null;
  member_number: number | null;
  crew_request_at: string | null;
};

type Conteggi = {
  rimozioni: number;
  segnalazioni: number;
  candidature: number;
  bacheca: number;
  totale: number;
};

function quando(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PostaPage() {
  const router = useRouter();
  const [pronto, setPronto] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [lavoro, setLavoro] = useState(false);

  const [conteggi, setConteggi] = useState<Conteggi | null>(null);
  const [rimozioni, setRimozioni] = useState<Rimozione[]>([]);
  const [segnalazioni, setSegnalazioni] = useState<Segnalazione[]>([]);
  const [candidature, setCandidature] = useState<Candidatura[]>([]);
  const [chiuse, setChiuse] = useState(false);

  const carica = useCallback(async () => {
    const supabase = createClient();
    const [n, r, s, c] = await Promise.all([
      supabase.rpc("admin_notifiche"),
      supabase.rpc("admin_rimozioni"),
      supabase.rpc("admin_reports"),
      supabase.rpc("admin_crew_requests"),
    ]);
    if (n.error) {
      setErrore(
        "La posta non è ancora installata sul database: va incollato " +
          "supabase/33_posta_admin.sql nel SQL Editor. (" +
          n.error.message +
          ")",
      );
      return;
    }
    setConteggi((n.data?.[0] as Conteggi) ?? null);
    setRimozioni((r.data as Rimozione[]) ?? []);
    setSegnalazioni((s.data as Segnalazione[]) ?? []);
    setCandidature((c.data as Candidatura[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: admin } = await supabase.rpc("is_admin");
      if (!admin) {
        router.replace("/admin/login");
        return;
      }
      await carica();
      setPronto(true);
    })();
  }, [router, carica]);

  async function togliFoto(r: Rimozione) {
    const motivo = window.prompt(
      `Togliere la foto dall'album "${r.album}"?\n\n` +
        "Sparisce dalla galleria e dai download. La richiesta si chiude da sé.\n\nNota interna:",
      r.motivo ?? "chiesto dalla persona ritratta",
    );
    if (motivo === null) return;
    setLavoro(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_foto_togli", {
      p_id: r.photo_id,
      p_motivo: motivo,
    });
    setLavoro(false);
    if (error) {
      window.alert(error.message);
      return;
    }
    await carica();
  }

  async function respingi(r: Rimozione) {
    if (!window.confirm("La foto resta dov'è e la richiesta si chiude. Sicuro?")) return;
    setLavoro(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_rimozione_respingi", { p_id: r.id });
    setLavoro(false);
    if (error) {
      window.alert(error.message);
      return;
    }
    await carica();
  }

  async function chiudiSegnalazione(s: Segnalazione) {
    if (!window.confirm(`Chiudere la segnalazione su ${s.reported_alias}?`)) return;
    setLavoro(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_close_report", { p_report: s.id });
    setLavoro(false);
    if (error) {
      window.alert(error.message);
      return;
    }
    await carica();
  }

  if (!pronto && !errore) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="font-display text-6xl text-brand-red animate-pulse-glow">1%</div>
      </main>
    );
  }

  const aperte = rimozioni.filter((r) => r.stato === "aperta");
  const storiche = rimozioni.filter((r) => r.stato !== "aperta");
  const segnalazioniAperte = segnalazioni.filter((s) => s.status === "open");

  return (
    <main className="flex-1 px-5 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/admin/dashboard"
            className="font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray hover:text-white"
          >
            ← pannello
          </Link>
          <Link
            href="/"
            className="font-tech text-[10px] uppercase tracking-[0.25em] text-brand-gray hover:text-white"
          >
            vedi il sito →
          </Link>
        </div>

        <p className="mt-6 font-tech text-[10px] uppercase tracking-[0.35em] text-brand-gray">
          posta
        </p>
        <h1 className="mt-2 font-display text-4xl uppercase leading-none text-white">
          Cosa aspetta te
        </h1>

        {errore ? (
          <p className="mt-6 border border-amber-400/40 bg-amber-400/5 px-4 py-4 text-[12px] leading-relaxed text-amber-200">
            {errore}
          </p>
        ) : (
          <>
            {conteggi && conteggi.totale === 0 && (
              <p className="mt-6 border border-emerald-400/30 bg-emerald-400/5 px-4 py-6 text-center text-sm text-emerald-300">
                Niente in sospeso. Tutto guardato.
              </p>
            )}

            {/* ---- Foto da togliere: la cosa più delicata, quindi in cima ---- */}
            <section className="mt-8">
              <h2 className="font-tech text-[11px] uppercase tracking-[0.25em] text-white">
                foto da togliere
                {aperte.length > 0 && (
                  <span className="ml-2 bg-brand-red px-2 py-0.5 text-[10px] text-white">
                    {aperte.length}
                  </span>
                )}
              </h2>
              <p className="mt-2 text-[11px] leading-relaxed text-brand-gray/70">
                Chi si vede in una foto della serata e non ci vuole stare. Vale la pena
                rispondere in fretta: è l&apos;unica richiesta che riguarda una persona vera.
              </p>

              <div className="mt-3 flex flex-col gap-2">
                {aperte.map((r) => (
                  <div key={r.id} className="border border-amber-400/40 px-4 py-3">
                    <div className="flex gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/foto/${r.photo_id}?f=thumb`}
                        alt=""
                        className="h-20 w-20 flex-shrink-0 border border-white/10 object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white">
                          {r.chi ?? "qualcuno"}
                          {r.numero ? (
                            <span className="ml-2 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                              #{r.numero}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                          {r.album} · {quando(r.quando)}
                        </p>
                        {r.motivo && (
                          <p className="mt-2 text-[12px] leading-relaxed text-white/80">
                            «{r.motivo}»
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => togliFoto(r)}
                        disabled={lavoro}
                        className="bg-brand-red px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-white disabled:opacity-40"
                      >
                        togli la foto
                      </button>
                      <button
                        onClick={() => respingi(r)}
                        disabled={lavoro}
                        className="border border-white/20 px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray hover:text-white disabled:opacity-40"
                      >
                        la lascio
                      </button>
                      <Link
                        href={`/foto/${r.album_slug}`}
                        target="_blank"
                        className="border border-white/10 px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray hover:text-white"
                      >
                        vedi l&apos;album
                      </Link>
                    </div>
                  </div>
                ))}

                {aperte.length === 0 && (
                  <p className="border border-white/10 px-4 py-4 text-[12px] text-brand-gray">
                    Nessuna richiesta aperta.
                  </p>
                )}

                {storiche.length > 0 && (
                  <button
                    onClick={() => setChiuse((c) => !c)}
                    className="self-start font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray hover:text-white"
                  >
                    {chiuse ? "nascondi" : `già gestite (${storiche.length})`}
                  </button>
                )}
                {chiuse &&
                  storiche.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-baseline justify-between gap-3 border border-white/5 px-4 py-2 text-[11px] text-brand-gray"
                    >
                      <span className="min-w-0 truncate">
                        {r.chi ?? "qualcuno"} · {r.album}
                      </span>
                      <span className="flex-shrink-0">
                        {r.stato === "rimossa" ? "tolta" : "lasciata"} · {quando(r.quando)}
                      </span>
                    </div>
                  ))}
              </div>
            </section>

            {/* ---- Segnalazioni fra membri ---- */}
            <section className="mt-10">
              <h2 className="font-tech text-[11px] uppercase tracking-[0.25em] text-white">
                segnalazioni
                {segnalazioniAperte.length > 0 && (
                  <span className="ml-2 bg-brand-red px-2 py-0.5 text-[10px] text-white">
                    {segnalazioniAperte.length}
                  </span>
                )}
              </h2>
              <div className="mt-3 flex flex-col gap-2">
                {segnalazioniAperte.map((s) => (
                  <div key={s.id} className="border border-white/15 px-4 py-3">
                    <p className="text-sm text-white">
                      {s.reporter_alias} ha segnalato{" "}
                      <strong className="text-brand-red">{s.reported_alias}</strong>
                    </p>
                    {s.reason && (
                      <p className="mt-2 text-[12px] leading-relaxed text-white/80">
                        «{s.reason}»
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => chiudiSegnalazione(s)}
                        disabled={lavoro}
                        className="border border-white/20 px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.15em] text-white disabled:opacity-40"
                      >
                        chiudi
                      </button>
                      <Link
                        href={`/u/${s.reported_alias}`}
                        target="_blank"
                        className="border border-white/10 px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray hover:text-white"
                      >
                        guarda il profilo
                      </Link>
                    </div>
                  </div>
                ))}
                {segnalazioniAperte.length === 0 && (
                  <p className="border border-white/10 px-4 py-4 text-[12px] text-brand-gray">
                    Nessuna segnalazione aperta.
                  </p>
                )}
              </div>
            </section>

            {/* ---- Candidature: la decisione resta dov'era, qui c'è il richiamo ---- */}
            <section className="mt-10">
              <h2 className="font-tech text-[11px] uppercase tracking-[0.25em] text-white">
                candidature staff
                {candidature.length > 0 && (
                  <span className="ml-2 bg-brand-red px-2 py-0.5 text-[10px] text-white">
                    {candidature.length}
                  </span>
                )}
              </h2>
              <div className="mt-3 flex flex-col gap-2">
                {candidature.slice(0, 6).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 border border-white/15 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">{c.alias}</p>
                      {c.nome && (
                        <p className="truncate text-[11px] text-brand-gray">{c.nome}</p>
                      )}
                    </div>
                    <span className="flex-shrink-0 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                      {quando(c.crew_request_at)}
                    </span>
                  </div>
                ))}
                {candidature.length === 0 ? (
                  <p className="border border-white/10 px-4 py-4 text-[12px] text-brand-gray">
                    Nessuna candidatura in attesa.
                  </p>
                ) : (
                  <Link
                    href="/admin/crew"
                    className="mt-1 block border border-white/20 px-4 py-3 text-center font-tech text-[10px] uppercase tracking-[0.2em] text-white transition-colors hover:border-brand-red"
                  >
                    leggi le risposte e decidi →
                  </Link>
                )}
              </div>
            </section>

            {/* ---- Bacheca ---- */}
            {conteggi && conteggi.bacheca > 0 && (
              <section className="mt-10">
                <h2 className="font-tech text-[11px] uppercase tracking-[0.25em] text-white">
                  bacheca
                  <span className="ml-2 bg-brand-red px-2 py-0.5 text-[10px] text-white">
                    {conteggi.bacheca}
                  </span>
                </h2>
                <Link
                  href="/admin/dashboard#bacheca"
                  className="mt-3 block border border-white/20 px-4 py-3 text-center font-tech text-[10px] uppercase tracking-[0.2em] text-white transition-colors hover:border-brand-red"
                >
                  {conteggi.bacheca} post-it da approvare →
                </Link>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
