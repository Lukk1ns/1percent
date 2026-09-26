"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  /** Chi l'ha chiesta, per rispondergli. Manca se ha cancellato l'account
   *  o se lo script 37 non è ancora incollato. */
  profile_id?: string | null;
};

/** Una conversazione fra la direzione e una persona (script 37). */
type ConversazioneRiga = {
  profile_id: string;
  alias: string;
  nome: string | null;
  numero: number | null;
  ultimo_testo: string;
  ultimo_mio: boolean;
  ultimo_at: string;
  non_letti: number;
};

type MsgDirezione = {
  id: string;
  da_direzione: boolean;
  testo: string;
  created_at: string;
  letto_at: string | null;
  album: string | null;
  album_slug: string | null;
  photo_id: string | null;
  motivo: string | null;
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
  risposte?: number;
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

/**
 * La conversazione con una persona, aperta dentro la posta.
 * Lei la trova nei suoi Messaggi sul sito e può rispondere.
 */
function Conversazione({
  profileId,
  chi,
  rimozioneId,
  onCambio,
}: {
  profileId: string;
  chi: string;
  /** Se si apre da una richiesta foto: il primo messaggio porta con sé
   *  di quale foto si parla, così lei capisce a cosa rispondi. */
  rimozioneId?: string;
  onCambio: () => void;
}) {
  const [msgs, setMsgs] = useState<MsgDirezione[] | null>(null);
  const [testo, setTesto] = useState("");
  const [invio, setInvio] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fondo = useRef<HTMLDivElement>(null);

  const leggi = useCallback(async () => {
    const { data, error } = await createClient().rpc("admin_direzione_thread", {
      p_profile: profileId,
    });
    if (error) {
      setErr(error.message);
      setMsgs([]);
      return;
    }
    setMsgs((data as MsgDirezione[]) ?? []);
    setTimeout(() => fondo.current?.scrollIntoView({ block: "nearest" }), 60);
    // Aprirla la segna come letta: il pallino della posta va rifatto.
    onCambio();
  }, [profileId, onCambio]);

  useEffect(() => {
    (async () => {
      await leggi();
    })();
    const supabase = createClient();
    const canale = supabase
      .channel(`direzione_${profileId}_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direzione_messaggi",
          filter: `profile_id=eq.${profileId}`,
        },
        () => leggi(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canale);
    };
  }, [profileId, leggi]);

  async function manda() {
    const t = testo.trim();
    if (!t || invio) return;
    setInvio(true);
    setErr(null);
    const { data, error } = await createClient().rpc("admin_direzione_scrivi", {
      p_profile: profileId,
      p_testo: t,
      p_rimozione: rimozioneId ?? null,
    });
    setInvio(false);
    if (error || data !== "ok") {
      setErr(
        data === "non_trovato"
          ? "Questa persona ha cancellato l'account."
          : data === "troppo_lungo"
            ? "Troppo lungo: massimo 1000 caratteri."
            : (error?.message ?? "Non inviato. Riprova."),
      );
      return;
    }
    setTesto("");
    await leggi();
  }

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      {msgs === null ? (
        <p className="py-3 text-center font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
          carico…
        </p>
      ) : msgs.length === 0 ? (
        <p className="pb-3 text-[11px] leading-relaxed text-brand-gray/80">
          Nessun messaggio ancora. Quello che scrivi arriva a{" "}
          <span className="text-white">{chi}</span> nei suoi Messaggi sul sito, firmato
          &laquo;1% · direzione&raquo;, e potrà risponderti.
        </p>
      ) : (
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pb-3">
          {msgs.map((m) => (
            <div
              key={m.id}
              className={`flex max-w-[85%] flex-col ${m.da_direzione ? "self-end items-end" : "self-start items-start"}`}
            >
              {m.album && (
                <p className="mb-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray/70">
                  sulla foto in {m.album}
                </p>
              )}
              <div
                className={`whitespace-pre-wrap px-3 py-2 text-[13px] leading-snug ${
                  m.da_direzione
                    ? "border border-brand-red/30 bg-brand-red/15 text-white"
                    : "border border-white/10 bg-white/[0.04] text-white/90"
                }`}
              >
                {m.testo}
              </div>
              <span className="mt-0.5 text-[9px] text-white/30">
                {m.da_direzione ? "tu · " : `${chi} · `}
                {quando(m.created_at)}
                {m.da_direzione && m.letto_at && " · letto"}
              </span>
            </div>
          ))}
          <div ref={fondo} />
        </div>
      )}

      <textarea
        value={testo}
        onChange={(e) => setTesto(e.target.value.slice(0, 1000))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            manda();
          }
        }}
        rows={3}
        placeholder={`scrivi a ${chi}…`}
        className="w-full resize-y border border-white/15 bg-black px-3 py-2 text-sm text-white placeholder-brand-gray/50 outline-none focus:border-brand-red"
      />
      {err && <p className="mt-1 text-[11px] text-brand-red">{err}</p>}
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[10px] leading-snug text-brand-gray/60">
          La legge quando apre il sito: non parte né mail né notifica sul telefono.
        </p>
        <button
          onClick={manda}
          disabled={invio || !testo.trim()}
          className="flex-shrink-0 bg-brand-red px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-white disabled:opacity-40"
        >
          {invio ? "…" : "invia"}
        </button>
      </div>
    </div>
  );
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
  const [conversazioni, setConversazioni] = useState<ConversazioneRiga[]>([]);
  // null = non si sa ancora; false = manca lo script 37 sul database.
  const [direzioneOk, setDirezioneOk] = useState<boolean | null>(null);
  // Quale conversazione è aperta: "r:<richiesta>" o "c:<persona>".
  const [aperta, setAperta] = useState<string | null>(null);

  const carica = useCallback(async () => {
    const supabase = createClient();
    const [n, r, s, c, d] = await Promise.all([
      supabase.rpc("admin_notifiche"),
      supabase.rpc("admin_rimozioni"),
      supabase.rpc("admin_reports"),
      supabase.rpc("admin_crew_requests"),
      supabase.rpc("admin_direzione_conversazioni"),
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
    setDirezioneOk(!d.error);
    setConversazioni(d.error ? [] : ((d.data as ConversazioneRiga[]) ?? []));
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

  // Qualcuno risponde mentre la posta è aperta: l'elenco si aggiorna da sé.
  useEffect(() => {
    const supabase = createClient();
    const canale = supabase
      .channel("posta_direzione")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direzione_messaggi" },
        () => carica(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canale);
    };
  }, [carica]);

  const apri = (chiave: string) => setAperta((a) => (a === chiave ? null : chiave));

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
  const daLeggere = conversazioni.filter((c) => Number(c.non_letti) > 0).length;

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
                      {r.profile_id && (
                        <button
                          onClick={() => apri(`r:${r.id}`)}
                          className={`border px-4 py-2.5 font-tech text-[10px] uppercase tracking-[0.15em] transition-colors ${
                            aperta === `r:${r.id}`
                              ? "border-brand-red text-white"
                              : "border-white/20 text-white hover:border-brand-red"
                          }`}
                        >
                          {aperta === `r:${r.id}` ? "chiudi" : "✉ rispondi"}
                        </button>
                      )}
                    </div>
                    {r.profile_id && aperta === `r:${r.id}` && (
                      <Conversazione
                        profileId={r.profile_id}
                        chi={r.chi ?? "questa persona"}
                        rimozioneId={r.id}
                        onCambio={carica}
                      />
                    )}
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
                    <div key={r.id} className="border border-white/5 px-4 py-2">
                      <div className="flex items-baseline justify-between gap-3 text-[11px] text-brand-gray">
                        <span className="min-w-0 truncate">
                          {r.chi ?? "qualcuno"} · {r.album}
                        </span>
                        <span className="flex flex-shrink-0 items-baseline gap-3">
                          {r.stato === "rimossa" ? "tolta" : "lasciata"} · {quando(r.quando)}
                          {r.profile_id && (
                            <button
                              onClick={() => apri(`r:${r.id}`)}
                              className="font-tech text-[10px] uppercase tracking-[0.15em] text-white hover:text-brand-red"
                            >
                              {aperta === `r:${r.id}` ? "chiudi" : "scrivi"}
                            </button>
                          )}
                        </span>
                      </div>
                      {r.motivo && aperta === `r:${r.id}` && (
                        <p className="mt-2 text-[12px] leading-relaxed text-white/70">
                          «{r.motivo}»
                        </p>
                      )}
                      {r.profile_id && aperta === `r:${r.id}` && (
                        <Conversazione
                          profileId={r.profile_id}
                          chi={r.chi ?? "questa persona"}
                          rimozioneId={r.id}
                          onCambio={carica}
                        />
                      )}
                    </div>
                  ))}
              </div>
            </section>

            {/* ---- Conversazioni con chi ha scritto ---- */}
            <section className="mt-10">
              <h2 className="font-tech text-[11px] uppercase tracking-[0.25em] text-white">
                conversazioni
                {daLeggere > 0 && (
                  <span className="ml-2 bg-brand-red px-2 py-0.5 text-[10px] text-white">
                    {daLeggere}
                  </span>
                )}
              </h2>
              <p className="mt-2 text-[11px] leading-relaxed text-brand-gray/70">
                Le persone a cui hai scritto. Si apre dal tasto &laquo;rispondi&raquo; su una
                richiesta; loro ti rispondono dai loro Messaggi.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {direzioneOk === false ? (
                  <p className="border border-amber-400/40 bg-amber-400/5 px-4 py-3 text-[12px] leading-relaxed text-amber-200">
                    Per rispondere va incollato <code>supabase/37_posta_conversazioni.sql</code>{" "}
                    nel SQL Editor.
                  </p>
                ) : conversazioni.length === 0 ? (
                  <p className="border border-white/10 px-4 py-4 text-[12px] text-brand-gray">
                    Nessuna conversazione ancora.
                  </p>
                ) : (
                  conversazioni.map((c) => {
                    const chiave = `c:${c.profile_id}`;
                    const nuovi = Number(c.non_letti) > 0;
                    return (
                      <div
                        key={c.profile_id}
                        className={`border px-4 py-3 ${nuovi ? "border-brand-red/50 bg-brand-red/[0.04]" : "border-white/15"}`}
                      >
                        <button
                          onClick={() => apri(chiave)}
                          className="flex w-full items-center justify-between gap-3 text-left"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-white">
                              {c.alias}
                              {c.numero ? (
                                <span className="ml-2 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                                  #{c.numero}
                                </span>
                              ) : null}
                              {c.nome && (
                                <span className="ml-2 text-[11px] text-brand-gray">{c.nome}</span>
                              )}
                            </span>
                            {aperta !== chiave && (
                              <span className="mt-0.5 block truncate text-[12px] text-brand-gray/80">
                                {c.ultimo_mio ? "tu: " : ""}
                                {c.ultimo_testo}
                              </span>
                            )}
                          </span>
                          <span className="flex flex-shrink-0 flex-col items-end gap-1">
                            <span className="font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                              {quando(c.ultimo_at)}
                            </span>
                            {nuovi && (
                              <span className="rounded-full bg-brand-red px-1.5 py-0.5 text-[9px] text-white">
                                {c.non_letti}
                              </span>
                            )}
                          </span>
                        </button>
                        {aperta === chiave && (
                          <Conversazione
                            profileId={c.profile_id}
                            chi={c.alias}
                            onCambio={carica}
                          />
                        )}
                      </div>
                    );
                  })
                )}
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
