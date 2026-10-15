"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { dataCorta, giornoEData, ora } from "@/lib/eventi";
import { delegaPerLocale, forseUnder16 } from "@/lib/event";
import { messaggioBiglietto } from "@/lib/biglietto-cliente";
import { apriWhatsapp, mostraNumero, normalizzaNumero } from "@/lib/whatsapp";
import {
  corrisponde,
  costruisciPersone,
  nomeIntero,
  type Biglietto,
  type Iscritto,
  type Persona,
  type Richiesta,
  type Serata,
} from "@/lib/persone";
import { MandaBiglietto } from "@/components/MandaBiglietto";

/**
 * CERCA UNA PERSONA (15 ott).
 *
 * Luka: *"devo poter cercare per nome anche tra i clienti o numero...
 * così raggiungo velocemente i profili e trovo tutte le info anche di
 * quello"*. Lo staff si cercava già (`/admin/crew`), i biglietti solo
 * una serata alla volta (`/admin/pr`); i clienti da nessuna parte.
 *
 * Il punto è che un cliente non sta in un posto solo. Chi si iscrive al
 * sito lascia alias e mail, niente nome né telefono; nome, cognome,
 * anno e numero li scrive il PR sul biglietto; le ragazze di MALDITA
 * li hanno lasciati nella loro lista. Qui si legge tutto insieme — con
 * le funzioni che il pannello usa già, quindi NESSUNO SCRIPT — e si
 * mette insieme per persona (come, in `lib/persone.ts`). Il numero
 * condiviso fra più nomi si dice nella scheda ("stesso numero anche per…").
 */

// Le liste omaggio che esistono. Una nuova si aggiunge qui.
const LISTE_OMAGGIO = [{ slug: "maldita", titolo: "Donna omaggio · MALDITA" }];

const euro = (n: number) => `${Number(n ?? 0).toFixed(0)} €`;

const STATO_BIGLIETTO: Record<string, { testo: string; classe: string }> = {
  attiva: { testo: "valido", classe: "text-emerald-400" },
  usata: { testo: "entrato", classe: "text-white" },
  annullata: { testo: "annullato", classe: "text-brand-gray/40 line-through" },
  in_attesa: { testo: "in attesa", classe: "text-amber-300" },
};

const STATO_RICHIESTA: Record<string, string> = {
  approvata: "approvata",
  in_attesa: "da decidere",
  lista_attesa: "lista d'attesa",
  rifiutata: "non confermata",
};

function tipoProfilo(p: Iscritto): { testo: string; classe: string } {
  if (p.role === "crew") return { testo: "staff", classe: "text-brand-red border-brand-red/50 bg-brand-red/10" };
  if (p.crew_request_status === "in_attesa")
    return { testo: "si è candidato", classe: "text-amber-300 border-amber-300/40 bg-amber-300/10" };
  if (p.crew_request_status === "rifiutata") return { testo: "rifiutato", classe: "text-white/40 border-white/15" };
  return { testo: "iscritto al sito", classe: "text-sky-300/80 border-sky-300/30 bg-sky-300/5" };
}

const quando = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function CercaPage() {
  const [carico, setCarico] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [mancano, setMancano] = useState<string[]>([]);
  const [persone, setPersone] = useState<Persona[]>([]);
  const [cerca, setCerca] = useState("");
  const [scelta, setScelta] = useState<string | null>(null);
  // Il modulo di delega di ogni serata (quello caricato a mano, se c'è).
  const [deleghe, setDeleghe] = useState<Record<string, string | null>>({});
  const campo = useRef<HTMLInputElement>(null);
  // Si rilegge tutto dopo aver eliminato qualcuno.
  const [giro, setGiro] = useState(0);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const saltati: string[] = [];
      const [membriRes, crewRes, candRes, serateRes, ...omaggiRes] = await Promise.all([
        supabase.rpc("admin_members"),
        supabase.rpc("admin_crew_answers"),
        supabase.rpc("admin_crew_requests"),
        supabase.rpc("admin_pr_eventi"),
        ...LISTE_OMAGGIO.map((l) => supabase.rpc("admin_omaggio_richieste", { p_slug: l.slug })),
      ]);
      if (membriRes.error && serateRes.error) {
        setErrore(
          membriRes.error.code
            ? `Il database ha risposto: ${membriRes.error.message}`
            : "Niente connessione: riprova tra un attimo.",
        );
        setCarico(false);
        return;
      }
      if (membriRes.error) saltati.push("iscritti al sito");

      // I numeri dello staff e dei candidati: dei clienti il sito non ne ha.
      const numeriProfili = new Map<string, string>();
      for (const r of [...(crewRes.data ?? []), ...(candRes.data ?? [])] as {
        id: string;
        telefono?: string | null;
      }[]) {
        if (r.telefono) numeriProfili.set(r.id, r.telefono);
      }

      // I biglietti si leggono una serata alla volta, tutte insieme.
      const serate = (serateRes.data ?? []) as Serata[];
      if (serateRes.error) saltati.push("biglietti");
      const perSerata = await Promise.all(
        serate.map((s) => supabase.rpc("admin_presales", { p_event: s.event_id })),
      );
      const biglietti: Biglietto[] = [];
      perSerata.forEach((res, i) => {
        if (res.error) saltati.push(`biglietti di ${serate[i].nome}`);
        for (const b of (res.data ?? []) as Omit<Biglietto, "serata">[]) {
          biglietti.push({ ...b, serata: serate[i] });
        }
      });

      const richieste: Richiesta[] = [];
      omaggiRes.forEach((res, i) => {
        // Senza la lista (script 42 non incollato) non c'è niente da dire.
        if (res.error) return;
        for (const r of (res.data ?? []) as Omit<Richiesta, "lista">[]) {
          richieste.push({ ...r, lista: LISTE_OMAGGIO[i].slug });
        }
      });

      setPersone(
        costruisciPersone((membriRes.data ?? []) as Iscritto[], numeriProfili, biglietti, richieste),
      );
      setMancano(saltati);
      setCarico(false);
    })();
  }, [giro]);

  const trovati = useMemo(() => {
    if (cerca.trim().length < 2) return [];
    return persone
      .filter((p) => corrisponde(p.testo, cerca))
      .sort((a, b) => b.ultimo.localeCompare(a.ultimo));
  }, [persone, cerca]);

  const persona = scelta ? persone.find((p) => p.chiave === scelta) ?? null : null;

  // Aperta una scheda: il modulo di delega delle sue serate, per il
  // messaggio col biglietto (uguale a quello del PR).
  useEffect(() => {
    if (!persona) return;
    const daLeggere = [...new Set(persona.biglietti.map((b) => b.serata.event_id))].filter(
      (id) => !(id in deleghe),
    );
    if (daLeggere.length === 0) return;
    const supabase = createClient();
    Promise.all(daLeggere.map((id) => supabase.rpc("admin_event_ticket", { p_event: id }))).then((ris) => {
      const nuove: Record<string, string | null> = {};
      ris.forEach((r, i) => (nuove[daLeggere[i]] = r.data?.[0]?.delega_url ?? null));
      setDeleghe((d) => ({ ...d, ...nuove }));
    });
  }, [persona, deleghe]);

  function apri(chiave: string) {
    setScelta(chiave);
    window.scrollTo({ top: 0 });
  }

  function chiudi() {
    setScelta(null);
    window.scrollTo({ top: 0 });
    setTimeout(() => campo.current?.focus(), 50);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-5 pb-24 pt-6">
      <h1 className="font-display text-3xl text-brand-red">Cerca una persona</h1>
      <p className="mt-1 text-xs uppercase tracking-widest text-brand-gray">
        clienti, staff, biglietti di tutte le serate, MALDITA
      </p>

      {persona ? (
        <Scheda
          p={persona}
          tutte={persone}
          deleghe={deleghe}
          onChiudi={chiudi}
          onApri={apri}
          onEliminata={() => {
            setGiro((g) => g + 1);
            chiudi();
          }}
        />
      ) : (
        <>
          {/* Resta attaccata sotto la barra del pannello mentre scorri. */}
          <div
            className="sticky z-10 -mx-5 mt-6 bg-black px-5 py-2"
            style={{ top: "calc(3.875rem + env(safe-area-inset-top))" }}
          >
            <input
              ref={campo}
              type="search"
              autoFocus
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="nome, cognome, telefono, alias, mail o tessera…"
              className="w-full border border-white/15 bg-black px-3 py-3.5 text-base text-white placeholder-brand-gray/50 outline-none focus:border-brand-red"
            />
            {cerca.trim().length >= 2 && !carico && (
              <p className="mt-2 text-[10px] uppercase tracking-widest text-brand-gray/60">
                {trovati.length === 0
                  ? "nessuno con questo nome o numero"
                  : trovati.length === 1
                    ? "trovata 1 persona"
                    : `trovate ${trovati.length} persone`}
              </p>
            )}
          </div>

          {errore && (
            <div className="mt-4 border border-brand-red/50 bg-brand-red/10 p-3 text-xs text-brand-red">
              {errore}
            </div>
          )}
          {mancano.length > 0 && (
            <p className="mt-3 text-[10px] uppercase tracking-widest text-amber-300/80">
              non letti: {mancano.join(", ")}
            </p>
          )}

          {carico ? (
            <p className="mt-6 animate-pulse-glow text-sm text-brand-gray">
              Leggo clienti e biglietti di tutte le serate…
            </p>
          ) : cerca.trim().length < 2 ? (
            <p className="mt-6 text-sm leading-relaxed text-brand-gray/70">
              {persone.length} persone fra iscritti, staff, biglietti e MALDITA.
              <br />
              Scrivi almeno due lettere o cifre. Nome e cognome anche al contrario
              («rossi mario»), il numero anche senza +39.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {trovati.slice(0, 60).map((p) => (
                <RigaPersona key={p.chiave} p={p} onApri={() => apri(p.chiave)} />
              ))}
              {trovati.length > 60 && (
                <p className="mt-2 text-[10px] uppercase tracking-widest text-brand-gray/60">
                  e altre {trovati.length - 60}: scrivi qualcosa in più
                </p>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}

/** Una riga dei risultati: chi è e, in breve, cosa ha fatto. */
function RigaPersona({ p, onApri }: { p: Persona; onApri: () => void }) {
  const vivi = p.biglietti.filter((b) => b.stato !== "annullata");
  const entrato = p.biglietti.filter((b) => b.stato === "usata").length;
  const ultimaSerata = [...vivi].sort((a, b) => b.serata.starts_at.localeCompare(a.serata.starts_at))[0];
  const profilo = p.profili[0];
  const etichetta = profilo ? tipoProfilo(profilo) : null;

  return (
    <button
      onClick={onApri}
      className="flex w-full items-center justify-between gap-3 border border-white/10 px-4 py-3 text-left transition-colors hover:border-brand-red"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm text-white">
          <span className="truncate">{p.nome}</span>
          {etichetta && (
            <span className={`flex-shrink-0 border px-1.5 py-0.5 text-[9px] uppercase tracking-widest ${etichetta.classe}`}>
              {etichetta.testo}
            </span>
          )}
          {p.richieste.length > 0 && (
            <span className="flex-shrink-0 border border-pink-300/40 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-pink-300">
              maldita
            </span>
          )}
        </p>
        <p className="mt-1 truncate font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
          {[
            profilo && profilo.alias !== p.nome ? profilo.alias : null,
            p.telefoni[0] ? mostraNumero(normalizzaNumero(p.telefoni[0]) ?? p.telefoni[0]) : null,
            vivi.length ? `${vivi.length} bigliett${vivi.length === 1 ? "o" : "i"}` : null,
            entrato ? `entrato ${entrato}` : null,
            ultimaSerata ? ultimaSerata.serata.nome : null,
          ]
            .filter(Boolean)
            .join(" · ") || "nessun biglietto"}
        </p>
      </div>
      <span className="flex-shrink-0 text-brand-gray" aria-hidden>
        →
      </span>
    </button>
  );
}

/** Tutto quello che si sa di una persona, in una pagina. */
function Scheda({
  p,
  tutte,
  deleghe,
  onChiudi,
  onApri,
  onEliminata,
}: {
  p: Persona;
  tutte: Persona[];
  deleghe: Record<string, string | null>;
  onChiudi: () => void;
  onApri: (chiave: string) => void;
  onEliminata: () => void;
}) {
  const biglietti = [...p.biglietti].sort(
    (a, b) => b.serata.starts_at.localeCompare(a.serata.starts_at) || b.created_at.localeCompare(a.created_at),
  );
  const vivi = biglietti.filter((b) => b.stato !== "annullata");
  const entrato = biglietti.filter((b) => b.stato === "usata").length;
  const pagati = vivi.filter((b) => Number(b.prezzo) > 0);
  const omaggi = vivi.length - pagati.length;
  const speso = pagati.reduce((s, b) => s + Number(b.prezzo), 0);

  // Chi gli ha venduto i biglietti, e quante volte.
  const daPr = new Map<string, number>();
  for (const b of pagati) daPr.set(b.pr_alias, (daPr.get(b.pr_alias) ?? 0) + 1);

  // Lo stesso numero scritto sul biglietto di qualcun altro.
  const mieiNumeri = new Set(p.telefoni.map((t) => normalizzaNumero(t) ?? t.replace(/\D/g, "")));
  const stessoNumero = tutte.filter(
    (x) => x.chiave !== p.chiave && x.telefoni.some((t) => mieiNumeri.has(normalizzaNumero(t) ?? t.replace(/\D/g, ""))),
  );

  const anni = p.anno ? new Date().getFullYear() - p.anno : null;
  const instagram = [...new Set(p.richieste.map((r) => r.instagram?.replace(/^@/, "").trim()).filter(Boolean))];

  const titolo = "font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray";

  return (
    <div className="mt-6">
      <button
        onClick={onChiudi}
        className="flex h-11 items-center gap-2 border border-white/20 px-3.5 font-tech text-xs uppercase tracking-[0.1em] text-white/85 hover:border-white/50"
      >
        <span aria-hidden>←</span> risultati
      </button>

      {/* Chi è */}
      <div className="mt-6 border border-white/10 px-5 py-5">
        <p className="font-display text-3xl leading-tight text-white">{p.nome}</p>
        {anni !== null && (
          <p className="mt-1 text-xs uppercase tracking-widest text-brand-gray">
            nato nel {p.anno} · {anni} anni
            {anni < 18 && <span className="ml-2 text-amber-300">minorenne</span>}
          </p>
        )}

        {p.telefoni.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {p.telefoni.map((t) => {
              const n = normalizzaNumero(t);
              return (
                <div key={t} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <span className="whitespace-nowrap font-tech text-sm tabular-nums text-white">{n ? mostraNumero(n) : t}</span>
                  <div className="flex gap-2">
                    {n && (
                      <button
                        onClick={() => apriWhatsapp(n)}
                        className="border border-emerald-400/50 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.15em] text-emerald-300 hover:bg-emerald-400/10"
                      >
                        whatsapp
                      </button>
                    )}
                    <a
                      href={`tel:${n ?? t.replace(/[^\d+]/g, "")}`}
                      className="border border-white/15 px-3 py-2 font-tech text-[10px] uppercase tracking-[0.15em] text-white hover:border-white/40"
                    >
                      chiama
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {instagram.map((ig) => (
          <a
            key={ig}
            href={`https://instagram.com/${ig}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block font-tech text-xs text-pink-300 hover:underline"
          >
            instagram @{ig}
          </a>
        ))}
        {p.telefoni.length === 0 && p.profili.length > 0 && (
          <p className="mt-3 text-xs text-brand-gray/70">
            Nessun numero: chi si iscrive al sito come cliente lascia solo alias e mail.
          </p>
        )}
      </div>

      {/* I numeri */}
      {biglietti.length > 0 && (
        <div className="mt-3 grid grid-cols-4 border border-white/10">
          {[
            ["biglietti", String(vivi.length)],
            ["entrato", String(entrato)],
            ["spesi", euro(speso)],
            ["omaggi", String(omaggi)],
          ].map(([cosa, quanto], i) => (
            <div key={cosa} className={`px-2 py-3 text-center ${i ? "border-l border-white/10" : ""}`}>
              <p className="font-display text-2xl text-white">{quanto}</p>
              <p className="font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">{cosa}</p>
            </div>
          ))}
        </div>
      )}
      {daPr.size > 0 && (
        <p className="mt-3 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
          venduti da:{" "}
          <span className="text-white">
            {[...daPr.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([pr, n]) => (n > 1 ? `${pr} (${n})` : pr))
              .join(", ")}
          </span>
        </p>
      )}

      {/* I biglietti, la serata più recente in cima */}
      {biglietti.length > 0 && (
        <section className="mt-8">
          <p className={titolo}>biglietti · {biglietti.length}</p>
          <div className="mt-3 flex flex-col gap-2">
            {biglietti.map((b) => {
              const stato = STATO_BIGLIETTO[b.stato] ?? STATO_BIGLIETTO.in_attesa;
              const s = b.serata;
              return (
                <div key={b.id} className="border border-white/10 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">{s.nome}</p>
                      <p className="mt-0.5 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                        {giornoEData(s.starts_at)}
                        {s.locale ? ` · ${s.locale}` : ""}
                      </p>
                      <p className="mt-1 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                        {Number(b.prezzo) > 0
                          ? `${b.tier_label} · ${euro(b.prezzo)} · da ${b.pr_alias}`
                          : /omaggio/i.test(b.tier_label)
                            ? b.tier_label
                            : `${b.tier_label} · omaggio`}
                        {` · fatto il ${quando(b.created_at)}`}
                      </p>
                      {nomeIntero(b.nome, b.cognome) !== p.nome && (
                        <p className="mt-1 text-[10px] text-brand-gray/60">
                          scritto «{b.nome} {b.cognome}»
                          {b.anno_nascita ? ` · ${b.anno_nascita}` : ""}
                        </p>
                      )}
                    </div>
                    <span className={`flex-shrink-0 font-tech text-[10px] uppercase tracking-[0.15em] ${stato.classe}`}>
                      {stato.testo}
                    </span>
                  </div>
                  {b.stato !== "annullata" && !s.passato && (
                    <MandaBiglietto
                      token={b.token}
                      telefono={b.telefono}
                      testo={messaggioBiglietto(b, s.nome, `${giornoEData(s.starts_at)} ore ${ora(s.starts_at)}`, {
                        serve: forseUnder16(b.anno_nascita, s.starts_at) || b.under16,
                        url: deleghe[s.event_id] ?? delegaPerLocale(s.locale),
                      })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Le liste omaggio (MALDITA) */}
      {p.richieste.length > 0 && (
        <section className="mt-8">
          <p className={titolo}>donna omaggio</p>
          <div className="mt-3 flex flex-col gap-2">
            {p.richieste.map((r) => (
              <div key={r.id} className="border border-pink-300/20 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-white">
                    {LISTE_OMAGGIO.find((l) => l.slug === r.lista)?.titolo ?? r.lista}
                  </p>
                  <span className="flex-shrink-0 font-tech text-[10px] uppercase tracking-[0.15em] text-pink-300">
                    {r.entrata_at ? "entrata" : STATO_RICHIESTA[r.stato] ?? r.stato}
                  </span>
                </div>
                <p className="mt-1 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                  {[
                    `iscritta il ${quando(r.created_at)}`,
                    r.conferma_at ? `conferma mandata ${dataCorta(r.conferma_at)}` : null,
                    r.entrata_at ? `entrata alle ${ora(r.entrata_at)}` : null,
                    r.shot_at ? "shot preso" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`/${r.lista}/${r.token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="border border-white/15 px-3 py-2.5 font-tech text-[10px] uppercase tracking-[0.15em] text-white hover:border-white/40"
                  >
                    la sua pagina
                  </a>
                  <Link
                    href={`/admin/${r.lista}`}
                    className="border border-white/10 px-3 py-2.5 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray hover:text-white"
                  >
                    pannello {r.lista}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sul sito */}
      {p.profili.length > 0 && (
        <section className="mt-8">
          <p className={titolo}>sul sito</p>
          <div className="mt-3 flex flex-col gap-2">
            {p.profili.map((x) => {
              const tipo = tipoProfilo(x);
              const portati = tutte.flatMap((y) => y.profili).filter((y) => y.invitato_da === x.alias).length;
              const staff = x.role === "crew" || x.crew_request_status === "in_attesa";
              return (
                <div key={x.id} className="border border-white/10 px-4 py-3">
                  <p className="flex items-center gap-2 text-sm text-white">
                    <span className="truncate">{x.alias}</span>
                    <span className={`flex-shrink-0 border px-1.5 py-0.5 text-[9px] uppercase tracking-widest ${tipo.classe}`}>
                      {tipo.testo}
                    </span>
                  </p>
                  <p className="mt-1 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                    tessera #{String(x.member_number).padStart(4, "0")} · iscritto il {quando(x.created_at)}
                  </p>
                  {x.email && <p className="mt-1 break-all text-xs text-white/80">{x.email}</p>}
                  {(x.invitato_da || portati > 0) && (
                    <p className="mt-1 text-[11px] text-brand-gray">
                      {x.invitato_da && <>portato da {x.invitato_da}</>}
                      {x.invitato_da && portati > 0 && " · "}
                      {portati > 0 && <>ha portato {portati} {portati === 1 ? "persona" : "persone"}</>}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={`/u/${encodeURIComponent(x.alias)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="border border-white/15 px-3 py-2.5 font-tech text-[10px] uppercase tracking-[0.15em] text-white hover:border-white/40"
                    >
                      profilo
                    </a>
                    {x.email && (
                      <a
                        href={`mailto:${x.email}`}
                        className="border border-white/10 px-3 py-2.5 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray hover:text-white"
                      >
                        mail
                      </a>
                    )}
                    {staff && (
                      <Link
                        href={`/admin/crew?cerca=${encodeURIComponent(x.alias)}`}
                        className="border border-white/10 px-3 py-2.5 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray hover:text-white"
                      >
                        apri nello staff
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {stessoNumero.length > 0 && (
        <section className="mt-8">
          <p className={titolo}>stesso numero anche per</p>
          <p className="mt-1 text-[11px] text-brand-gray/70">
            Spesso è il PR che ha messo il suo, o un amico che ha fatto per tutti.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {stessoNumero.slice(0, 20).map((x) => (
              <button
                key={x.chiave}
                onClick={() => onApri(x.chiave)}
                className="border border-white/15 px-3 py-2 text-xs text-white hover:border-brand-red"
              >
                {x.nome}
              </button>
            ))}
          </div>
        </section>
      )}

      <EliminaPersona key={p.chiave} p={p} onFatto={onEliminata} />
    </div>
  );
}

type Annullato = {
  serata: string;
  pr: string;
  prezzo: number;
  rimborso: number;
  manager: string | null;
};

/** Il motivo per cui il database si è fermato, detto come serve a Luka. */
function spiegaRifiuto(err: { code?: string; message: string }): string {
  if (!err.code) return "Niente connessione: non è cambiato niente, riprova tra un attimo.";
  if (err.code === "PGRST202")
    return "Manca lo script: incolla supabase/46_elimina_persona.sql nel SQL Editor di Supabase, poi riprova.";
  const [motivo, chi, quanto] = err.message.split(":");
  const soldi = euro(Math.abs(Number(quanto)));
  if (motivo === "soldi_aperti")
    return Number(quanto) > 0
      ? `${chi} deve ancora consegnarti ${soldi} su una serata. Prima chiudi i suoi conti (Prevendite → PR), poi eliminalo. Non è cambiato niente.`
      : `${chi} ti ha portato ${soldi} più di quanto ha venduto su una serata. Prima sistema i suoi conti (Prevendite → Soldi), poi eliminalo. Non è cambiato niente.`;
  if (motivo === "manager_con_soldi")
    return `${chi}, da manager, ha ancora ${soldi} in mano. Prima segna che te li ha portati (Prevendite → Manager), poi eliminalo. Non è cambiato niente.`;
  return `Il database ha risposto: ${err.message}. Non è cambiato niente.`;
}

/**
 * Eliminare una persona (15 ott). Luka: *"devo aver la possibilità di
 * eliminarlo tutto con le sue info"*; sui biglietti ancora validi: *"lo
 * annulli ma mi avvisi che cosa sta succedendo"*. Quindi prima si dice
 * tutto, riga per riga, e solo dopo il tasto rosso. Il lavoro lo fa
 * `admin_elimina_persona` (script 46), tutto o niente.
 */
function EliminaPersona({ p, onFatto }: { p: Persona; onFatto: () => void }) {
  const [aperto, setAperto] = useState(false);
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState<Annullato[] | null>(null);

  const daAnnullare = p.biglietti.filter(
    (b) => (b.stato === "attiva" || b.stato === "in_attesa") && !b.serata.passato,
  );
  const staff = p.profili.filter((x) => x.role === "crew");

  async function elimina() {
    setLavoro(true);
    setErrore(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_elimina_persona", {
      p_profili: p.profili.map((x) => x.id),
      p_biglietti: p.biglietti.map((b) => b.id),
      p_richieste: p.richieste.map((r) => r.id),
    });
    if (error) {
      setErrore(spiegaRifiuto(error));
      setLavoro(false);
      return;
    }
    // Le foto del profilo stanno nello storage, che da SQL non si tocca.
    await Promise.all(
      p.profili.flatMap((x) => [
        supabase.storage.from("volti").remove([`${x.id}/volto.webp`]),
        supabase.storage.from("volti-blur").remove([`${x.id}/volto.webp`]),
      ]),
    );
    setFatto(((data as { annullati?: Annullato[] })?.annullati ?? []) as Annullato[]);
    setLavoro(false);
  }

  const riga = "flex gap-2 text-sm leading-relaxed text-white/85";

  if (fatto) {
    return (
      <section className="mt-12 border border-emerald-400/40 bg-emerald-400/5 px-5 py-5">
        <p className="font-tech text-xs uppercase tracking-[0.2em] text-emerald-300">eliminato ✓</p>
        <p className="mt-2 text-sm text-white/85">
          {p.nome} non c&apos;è più: dati cancellati
          {p.profili.length > 0 ? ", profilo e foto tolti" : ""}.
        </p>
        {fatto.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {fatto.map((a, i) => (
              <p key={i} className="text-sm leading-relaxed text-white/85">
                Annullato il biglietto di <b>{a.serata}</b>
                {Number(a.prezzo) > 0 ? ` (${euro(a.prezzo)}, ${a.pr})` : " (omaggio)"}:{" "}
                {Number(a.rimborso) > 0
                  ? `${euro(a.rimborso)} stornati a ${a.pr}, non li deve più.`
                  : Number(a.prezzo) > 0
                    ? `${a.pr} non li aveva ancora consegnati, quindi non c'è niente da stornare.`
                    : "nessun soldo di mezzo."}
                {a.manager && (
                  <span className="mt-1 block text-amber-300">
                    ⚠️ Quei contanti risultano in mano a {a.manager}: se li ha restituiti al cliente,
                    storna anche il suo movimento (Prevendite → Manager).
                  </span>
                )}
              </p>
            ))}
          </div>
        )}
        <button
          onClick={onFatto}
          className="mt-5 flex h-11 items-center border border-white/20 px-4 font-tech text-xs uppercase tracking-[0.1em] text-white hover:border-white/50"
        >
          torna alla ricerca
        </button>
      </section>
    );
  }

  if (!aperto) {
    return (
      <div className="mt-12 border-t border-white/10 pt-6">
        <button
          onClick={() => setAperto(true)}
          className="flex h-11 items-center border border-brand-red/60 px-4 font-tech text-xs uppercase tracking-[0.1em] text-brand-red hover:bg-brand-red/10"
        >
          elimina questa persona
        </button>
      </div>
    );
  }

  return (
    <section className="mt-12 border border-brand-red/60 bg-brand-red/5 px-5 py-5">
      <p className="font-display text-2xl text-white">Eliminare {p.nome}?</p>
      <p className="mt-1 font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray">
        ecco cosa succede
      </p>

      <div className="mt-4 flex flex-col gap-2.5">
        {p.profili.map((x) => (
          <p key={x.id} className={riga}>
            <span aria-hidden>·</span>
            <span>
              Profilo <b>{x.alias}</b> (tessera #{String(x.member_number).padStart(4, "0")}): spariscono
              alias, mail, numero, foto e risposte, il suo QR non vale più.
              {x.role === "crew" && " Esce dallo staff e dalle serate a cui era agganciato."}
            </span>
          </p>
        ))}
        {p.biglietti.length > 0 && (
          <p className={riga}>
            <span aria-hidden>·</span>
            <span>
              {p.biglietti.length === 1 ? "Il suo biglietto" : `I suoi ${p.biglietti.length} biglietti`}: nome,
              cognome e telefono spariscono. {p.biglietti.length === 1 ? "Resta" : "Restano"} nei conti come
              «cancellato», così incassi e soldi dei PR non cambiano.
            </span>
          </p>
        )}
        {p.richieste.length > 0 && (
          <p className={riga}>
            <span aria-hidden>·</span>
            <span>La sua iscrizione a MALDITA viene cancellata.</span>
          </p>
        )}
        {staff.length > 0 && (
          <p className={riga}>
            <span aria-hidden>·</span>
            <span>
              Se come PR ha ancora soldi da consegnarti, il sito si ferma e te lo dice: prima si chiudono i
              conti.
            </span>
          </p>
        )}
      </div>

      {daAnnullare.length > 0 && (
        <div className="mt-4 border border-amber-300/50 bg-amber-300/5 px-4 py-3">
          <p className="font-tech text-[10px] uppercase tracking-[0.2em] text-amber-300">
            ⚠️ {daAnnullare.length === 1 ? "questo biglietto viene annullato" : "questi biglietti vengono annullati"}
          </p>
          <div className="mt-2 flex flex-col gap-1">
            {daAnnullare.map((b) => (
              <p key={b.id} className="text-sm text-white">
                {b.serata.nome} · {giornoEData(b.serata.starts_at)} ·{" "}
                {Number(b.prezzo) > 0 ? `${euro(b.prezzo)} · PR ${b.pr_alias}` : "omaggio"}
              </p>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-white/75">
            Il QR non apre più la porta. Se il PR ti aveva già consegnato quei soldi, gli vengono stornati,
            come quando annulli un biglietto dalle Prevendite.
          </p>
        </div>
      )}

      <p className="mt-4 text-xs text-brand-gray">Non si torna indietro.</p>

      {errore && (
        <div className="mt-4 border border-brand-red/50 bg-brand-red/10 p-3 text-sm leading-relaxed text-brand-red">
          {errore}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={elimina}
          disabled={lavoro}
          className="flex h-11 items-center bg-brand-red px-4 font-tech text-xs uppercase tracking-[0.1em] text-white disabled:opacity-50"
        >
          {lavoro ? "elimino…" : "sì, elimina tutto"}
        </button>
        <button
          onClick={() => {
            setAperto(false);
            setErrore(null);
          }}
          disabled={lavoro}
          className="flex h-11 items-center border border-white/20 px-4 font-tech text-xs uppercase tracking-[0.1em] text-white/85 hover:border-white/50"
        >
          lascia stare
        </button>
      </div>
    </section>
  );
}
