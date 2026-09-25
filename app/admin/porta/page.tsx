"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { accentoSerata, giornoEData, ora } from "@/lib/eventi";
import { preparaAudio, suonaAttenzione, suonaNo, suonaOk } from "@/lib/suoni";
import {
  type BigliettoLocale,
  cercaOffline,
  codaDaMandare,
  contatoreLocale,
  daMandare,
  depositoAttuale,
  salvaLista,
  segnaMandati,
  svuota,
  validaOffline,
} from "@/lib/porta-offline";

type Serata = { event_id: string; nome: string; starts_at: string; biglietti: number };

type Esito = {
  esito:
    | "ok"
    | "gia_usato"
    | "non_pagato"
    | "annullato"
    | "altra_serata"
    | "sconosciuto"
    // il pass del PR: passa solo se ha fatto i suoi numeri
    | "pr_ok"
    | "pr_non_attivo";
  nome: string | null;
  cognome: string | null;
  tier_label: string | null;
  prezzo: number | null;
  minorenne: boolean | null;
  under16: boolean | null;
  pr_alias: string | null;
  evento: string | null;
  entrata_at: string | null;
  presale_id: string | null;
};

type Riepilogo = {
  entrati: number;
  attesi: number;
  non_pagati: number;
  ultimi: { nome: string; cognome: string; usata_at: string }[];
};

type Trovato = {
  id: string;
  nome: string;
  cognome: string;
  tier_label: string;
  stato: string;
  pr_alias: string;
  minorenne: boolean;
  under16: boolean;
  token: string;
};

type Scanner = {
  start: (
    camera: { facingMode: string },
    config: object,
    onSuccess: (t: string) => void,
    onError: (e: string) => void,
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
};

/** Il token nudo: il QR del biglietto lo contiene già, ma può arrivare come link. */
function tokenDa(letto: string): string {
  try {
    const u = new URL(letto);
    const pezzi = u.pathname.split("/").filter(Boolean);
    return pezzi[pezzi.length - 1] || letto;
  } catch {
    return letto.trim();
  }
}

/**
 * LA PORTA.
 *
 * Non è lo scanner dello stand (quello dei regali, `/admin/scan`): qui
 * si valida l'ingresso, e un biglietto entra una volta sola.
 *
 * Pensata per chi la usa: si sta in piedi, al freddo, con una mano
 * sola, con la musica alta. Quindi l'esito prende tutto lo schermo,
 * i colori si capiscono da lontano e ogni esito ha il suo suono.
 */
export default function PortaPage() {
  const router = useRouter();

  const [serate, setSerate] = useState<Serata[]>([]);
  const [serata, setSerata] = useState<string>("");
  const [riepilogo, setRiepilogo] = useState<Riepilogo | null>(null);
  const [esito, setEsito] = useState<Esito | null>(null);
  const [autorizzato, setAutorizzato] = useState<boolean | null>(null);
  const [sonoAdmin, setSonoAdmin] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [camErrore, setCamErrore] = useState<string | null>(null);
  // Un tocco in più per riprovare: su certi telefoni il permesso della
  // fotocamera arriva solo se parte da un gesto.
  const [tentativoCam, setTentativoCam] = useState(0);

  // ricerca per nome, per chi arriva senza QR
  const [cerca, setCerca] = useState("");
  const [trovati, setTrovati] = useState<Trovato[]>([]);
  const [modoCerca, setModoCerca] = useState(false);

  const scannerRef = useRef<Scanner | null>(null);
  const occupato = useRef(false);

  // ── senza rete ──────────────────────────────────────────────
  const [inRete, setInRete] = useState(true);
  const [listaPronta, setListaPronta] = useState<{ quanti: number; quando: string } | null>(null);
  const [inCoda, setInCoda] = useState(0);
  const [scaricando, setScaricando] = useState(false);
  const [localeEntrati, setLocaleEntrati] = useState<{ entrati: number; totali: number } | null>(null);

  const aggiornaRiepilogo = useCallback(async (ev: string) => {
    if (!ev) return;
    const supabase = createClient();
    const { data } = await supabase.rpc("porta_riepilogo", { p_event: ev });
    setRiepilogo(data?.[0] ?? null);
  }, []);

  // Il guardiano che tiene la pagina in cassaforte, e l'orecchio sulla rete
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw-porta.js", { scope: "/admin/porta" }).catch(() => {});
    }
    const su = () => setInRete(true);
    const giu = () => setInRete(false);
    setInRete(navigator.onLine);
    window.addEventListener("online", su);
    window.addEventListener("offline", giu);

    const d = depositoAttuale();
    if (d) {
      setListaPronta({ quanti: d.biglietti.length, quando: d.scaricata });
      setLocaleEntrati(contatoreLocale());
    }
    setInCoda(daMandare());

    return () => {
      window.removeEventListener("online", su);
      window.removeEventListener("offline", giu);
    };
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      // In porta ci stanno anche gli account manager: il permesso è
      // lo stesso delle funzioni porta_* (is_staff OPPURE manager).
      const [{ data: staff }, { data: admin }, { data: manager }] = await Promise.all([
        supabase.rpc("is_staff"),
        supabase.rpc("is_admin"),
        supabase.rpc("is_account_manager"),
      ]);
      if (!staff && !manager) {
        router.replace("/admin/login");
        return;
      }
      setAutorizzato(true);
      setSonoAdmin(Boolean(admin));

      const { data, error } = await supabase.rpc("porta_serate");
      if (error) {
        setErrore(
          "La porta non è installata sul database: incolla supabase/20_porta.sql. (" +
            error.message +
            ")",
        );
        return;
      }
      const lista: Serata[] = data ?? [];
      setSerate(lista);
      const scelta = lista[0]?.event_id ?? "";
      setSerata(scelta);
      if (scelta) aggiornaRiepilogo(scelta);
    })();
  }, [router, aggiornaRiepilogo]);

  const valida = useCallback(
    async (token: string) => {
      if (occupato.current || !serata) return;
      occupato.current = true;

      let r: Esito;

      // Senza campo si lavora sulla lista scaricata prima
      if (!navigator.onLine && depositoAttuale()) {
        const loc = validaOffline(token);
        r = {
          esito:
            loc.esito === "senza_lista"
              ? "sconosciuto"
              : (loc.esito as Esito["esito"]),
          nome: loc.biglietto?.nome ?? null,
          cognome: loc.biglietto?.cognome ?? null,
          tier_label: loc.biglietto?.tier_label ?? null,
          prezzo: null,
          minorenne: loc.biglietto?.minorenne ?? null,
          under16: loc.biglietto?.under16 ?? null,
          pr_alias: loc.biglietto?.pr_alias ?? null,
          evento: null,
          entrata_at: null,
          presale_id: null,
        };
        setInCoda(daMandare());
        setLocaleEntrati(contatoreLocale());
      } else {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("porta_checkin", {
          p_token: token,
          p_event: serata,
        });

        if (error && depositoAttuale()) {
          // il server non risponde ma la lista ce l'abbiamo: si va avanti
          const loc = validaOffline(token);
          r = {
            esito: loc.esito === "senza_lista" ? "sconosciuto" : (loc.esito as Esito["esito"]),
            nome: loc.biglietto?.nome ?? null,
            cognome: loc.biglietto?.cognome ?? null,
            tier_label: loc.biglietto?.tier_label ?? null,
            prezzo: null,
            minorenne: loc.biglietto?.minorenne ?? null,
            under16: loc.biglietto?.under16 ?? null,
            pr_alias: loc.biglietto?.pr_alias ?? null,
            evento: null,
            entrata_at: null,
            presale_id: null,
          };
          setInCoda(daMandare());
          setLocaleEntrati(contatoreLocale());
        } else {
          r = error
            ? {
                esito: "sconosciuto",
                nome: null, cognome: null, tier_label: null, prezzo: null,
                minorenne: null, under16: null, pr_alias: null, evento: null,
                entrata_at: null, presale_id: null,
              }
            : (data?.[0] as Esito);
        }
      }

      if (r.esito === "ok" || r.esito === "pr_ok") suonaOk();
      else if (r.esito === "non_pagato" || r.esito === "pr_non_attivo") suonaAttenzione();
      else suonaNo();

      // vibrazione diversa: si sente anche in tasca
      if (navigator.vibrate) {
        navigator.vibrate(
          r.esito === "ok" || r.esito === "pr_ok"
            ? 60
            : r.esito === "non_pagato" || r.esito === "pr_non_attivo"
              ? [80, 60, 80]
              : [250],
        );
      }

      setEsito(r);
      if (navigator.onLine) await aggiornaRiepilogo(serata);

      // quanto resta sullo schermo: se passa, poco; se c'è da leggere, di più
      const quanto = r.esito === "ok" ? 2600 : 5200;
      setTimeout(() => {
        setEsito(null);
        occupato.current = false;
      }, quanto);
    },
    [serata, aggiornaRiepilogo],
  );

  // La fotocamera: accesa quando non c'è un esito da leggere
  useEffect(() => {
    if (!autorizzato || errore || esito || modoCerca || !serata) return;

    let annullato = false;
    setCamErrore(null);

    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (annullato) return;
      const inst = new Html5Qrcode("porta-reader", {
        verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      }) as unknown as Scanner;
      scannerRef.current = inst;

      try {
        await inst.start(
          { facingMode: "environment" },
          {
            fps: 14,
            qrbox: (w: number, h: number) => {
              const s = Math.floor(Math.min(w, h) * 0.8);
              return { width: s, height: s };
            },
          },
          (letto: string) => {
            if (occupato.current) return;
            valida(tokenDa(letto));
          },
          () => {},
        );
      } catch (e) {
        if (!annullato) {
          const err = e as { name?: string; message?: string };
          setCamErrore(
            err?.name === "NotAllowedError"
              ? "Permesso alla fotocamera negato."
              : err?.name === "NotReadableError"
                ? "La fotocamera è occupata da un'altra app."
                : `${err?.name ?? "Errore"}: ${err?.message ?? "non si accende"}`,
          );
        }
      }
    })();

    return () => {
      annullato = true;
      const inst = scannerRef.current;
      scannerRef.current = null;
      if (inst) inst.stop().then(() => inst.clear()).catch(() => {});
    };
  }, [autorizzato, errore, esito, modoCerca, serata, valida, tentativoCam]);

  // Ricerca per nome
  useEffect(() => {
    if (!modoCerca || cerca.trim().length < 2 || !serata) {
      setTrovati([]);
      return;
    }
    const t = setTimeout(async () => {
      if (!navigator.onLine && depositoAttuale()) {
        setTrovati(
          cercaOffline(cerca).map((b) => ({
            id: b.token,
            nome: b.nome,
            cognome: b.cognome,
            tier_label: b.tier_label,
            stato: b.stato,
            pr_alias: b.pr_alias,
            minorenne: b.minorenne,
            under16: b.under16,
            token: b.token,
          })),
        );
        return;
      }
      const supabase = createClient();
      const { data } = await supabase.rpc("porta_cerca", {
        p_event: serata,
        p_testo: cerca.trim(),
      });
      setTrovati(data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [cerca, modoCerca, serata]);

  /** Portarsi dietro la lista: si fa PRIMA, con la rete buona. */
  async function scaricaLista() {
    if (!serata) return;
    setScaricando(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("porta_lista", { p_event: serata });
    setScaricando(false);

    if (error) {
      window.alert(
        "Non riesco a scaricare la lista. Se manca supabase/21_porta_offline.sql, va incollato.\n\n" +
          error.message,
      );
      return;
    }

    try {
      salvaLista(serata, ev?.nome ?? "serata", (data ?? []) as BigliettoLocale[]);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Non riesco a salvare la lista.");
      return;
    }

    const d = depositoAttuale();
    if (d) setListaPronta({ quanti: d.biglietti.length, quando: d.scaricata });
    setLocaleEntrati(contatoreLocale());
    window.alert(
      `Lista pronta: ${(data ?? []).length} biglietti sul telefono.\n\n` +
        `Da adesso la porta funziona anche senza campo.`,
    );
  }

  /** Riportare al server gli ingressi fatti senza rete. */
  const mandaCoda = useCallback(async () => {
    const coda = codaDaMandare();
    if (coda.length === 0) return;

    const supabase = createClient();
    const { data, error } = await supabase.rpc("porta_sync", { p_scansioni: coda });
    if (error) return;

    const esiti = (data ?? []) as { token: string; esito: string; nome: string; cognome: string }[];
    segnaMandati(esiti.map((e) => e.token));
    setInCoda(daMandare());
    if (serata) aggiornaRiepilogo(serata);

    // I doppi ingressi si dicono, non si nascondono
    const doppi = esiti.filter((e) => e.esito === "gia_entrato");
    if (doppi.length > 0) {
      window.alert(
        `⚠️ ${doppi.length} ${doppi.length === 1 ? "persona era" : "persone erano"} già entrata prima:\n\n` +
          doppi.map((d) => `· ${d.nome} ${d.cognome}`).join("\n") +
          `\n\nSuccede quando due telefoni lavorano senza rete e non si parlano.`,
      );
    }
  }, [serata, aggiornaRiepilogo]);

  // Appena torna il campo, la coda parte da sola
  useEffect(() => {
    if (inRete && inCoda > 0) mandaCoda();
  }, [inRete, inCoda, mandaCoda]);

  async function faiEntrareLoStesso(id: string) {
    if (
      !window.confirm(
        "Farlo entrare senza che il PR abbia consegnato i soldi?\n\n" +
          "Resta scritto che è passato così, e il debito del PR non cambia.",
      )
    )
      return;
    const supabase = createClient();
    const { data, error } = await supabase.rpc("porta_forza", { p_id: id });
    if (error) {
      window.alert(error.message);
      return;
    }
    if (data?.[0]?.esito === "ok") {
      suonaOk();
      setEsito(null);
      occupato.current = false;
      await aggiornaRiepilogo(serata);
      window.alert(`${data[0].nome} ${data[0].cognome} può entrare.`);
    } else if (data?.[0]?.esito === "gia_usato") {
      window.alert("Questo biglietto è già entrato.");
    }
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

  const ev = serate.find((s) => s.event_id === serata);
  const accento = serata ? accentoSerata(serata) : "#e0181f";

  return (
    <main className="flex min-h-[100dvh] flex-1 flex-col" onTouchStart={preparaAudio}>
      {/* Testa: serata e conteggio, sempre visibili */}
      <div
        className="border-b border-l-4 bg-black px-4 py-3"
        style={{ borderLeftColor: accento, borderBottomColor: "#ffffff15" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p
              className="font-tech text-[10px] uppercase tracking-[0.25em]"
              style={{ color: accento }}
            >
              {ev ? giornoEData(ev.starts_at) : "porta"}
            </p>
            <p className="truncate font-display text-xl uppercase leading-none text-white">
              {ev?.nome ?? "—"}
            </p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="font-display text-3xl leading-none text-white">
              {riepilogo?.entrati ?? 0}
            </p>
            <p className="font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
              entrati / {riepilogo?.attesi ?? 0}
            </p>
          </div>
        </div>

        {/* Com'è messa la porta adesso: rete, lista, cose da mandare */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`font-tech text-[9px] uppercase tracking-[0.15em] ${
              inRete ? "text-brand-gray" : "text-amber-300"
            }`}
          >
            {inRete ? "in rete" : "⚠ senza rete"}
          </span>

          {listaPronta ? (
            <span className="font-tech text-[9px] uppercase tracking-[0.15em] text-emerald-400">
              lista pronta · {listaPronta.quanti}
              {localeEntrati ? ` · ${localeEntrati.entrati} entrati` : ""}
            </span>
          ) : (
            <span className="font-tech text-[9px] uppercase tracking-[0.15em] text-amber-300">
              nessuna lista sul telefono
            </span>
          )}

          {inCoda > 0 && (
            <span className="font-tech text-[9px] uppercase tracking-[0.15em] text-amber-300">
              {inCoda} da mandare
            </span>
          )}

          <button
            onClick={scaricaLista}
            disabled={scaricando || !inRete || !serata}
            className="ml-auto border border-white/20 px-2.5 py-1.5 font-tech text-[9px] uppercase tracking-[0.15em] text-white disabled:opacity-40"
          >
            {scaricando ? "scarico…" : listaPronta ? "aggiorna lista" : "scarica lista"}
          </button>
        </div>

        {!listaPronta && inRete && (
          <p className="mt-2 text-[11px] leading-relaxed text-amber-300">
            Scarica la lista adesso, finché il campo è buono: se durante la serata cade la
            rete, senza lista la porta si ferma.
          </p>
        )}

        {serate.length > 1 && (
          <select
            value={serata}
            onChange={(e) => {
              setSerata(e.target.value);
              aggiornaRiepilogo(e.target.value);
            }}
            className="mt-2 w-full border border-white/15 bg-black px-2 py-2 text-xs text-white outline-none"
          >
            {serate.map((s) => (
              <option key={s.event_id} value={s.event_id}>
                {giornoEData(s.starts_at)} — {s.nome}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Il grosso dello schermo */}
      <div className="relative flex-1">
        {esito ? (
          <Risposta
            esito={esito}
            sonoAdmin={sonoAdmin}
            onForza={faiEntrareLoStesso}
            onChiudi={() => {
              setEsito(null);
              occupato.current = false;
            }}
          />
        ) : modoCerca ? (
          <div className="px-4 py-5">
            <input
              autoFocus
              placeholder="cognome o nome…"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              className="w-full border-b border-white/25 bg-transparent pb-3 text-lg text-white placeholder-brand-gray/50 outline-none focus:border-brand-red"
            />
            <div className="mt-4 flex flex-col gap-2">
              {trovati.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setModoCerca(false);
                    setCerca("");
                    valida(t.token);
                  }}
                  className="border border-white/10 px-4 py-3 text-left"
                >
                  <p className="text-sm text-white">
                    {t.nome} {t.cognome}
                    {t.under16 && (
                      <span className="ml-2 font-tech text-[9px] uppercase text-amber-300">
                        under 16
                      </span>
                    )}
                  </p>
                  <p className="mt-1 font-tech text-[10px] uppercase tracking-[0.15em] text-brand-gray">
                    {t.tier_label} · {t.pr_alias} ·{" "}
                    <span
                      className={
                        t.stato === "usata"
                          ? "text-brand-red"
                          : t.stato === "attiva"
                            ? "text-emerald-400"
                            : "text-amber-300"
                      }
                    >
                      {t.stato === "usata"
                        ? "già entrato"
                        : t.stato === "attiva"
                          ? "può entrare"
                          : "non pagato"}
                    </span>
                  </p>
                </button>
              ))}
              {cerca.trim().length >= 2 && trovati.length === 0 && (
                <p className="px-2 py-6 text-center text-sm text-brand-gray">
                  Nessuno con questo nome in lista.
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div id="porta-reader" className="h-full w-full [&_video]:h-full [&_video]:object-cover" />
            {camErrore && (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
                <button
                  onClick={() => setTentativoCam((n) => n + 1)}
                  className="w-full max-w-xs bg-brand-red px-6 py-4 text-sm font-semibold uppercase tracking-widest text-white"
                >
                  Accendi la fotocamera
                </button>
                <p className="mt-3 text-[12px] leading-relaxed text-brand-gray">{camErrore}</p>
                <p className="mt-2 text-[11px] leading-relaxed text-brand-gray/70">
                  Dall&apos;icona sulla schermata Home a volte non parte: apri unpercento.it da
                  Safari. Oppure cerca le persone per nome, qui sotto.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Piede: il bottone grande per chi non ha il QR */}
      <div className="border-t border-white/10 bg-black px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={() => {
              setModoCerca((v) => !v);
              setCerca("");
              setTrovati([]);
              setEsito(null);
              occupato.current = false;
            }}
            className={`flex-1 py-4 text-[11px] font-semibold uppercase tracking-widest ${
              modoCerca ? "bg-white/10 text-white" : "bg-brand-red text-white"
            }`}
          >
            {modoCerca ? "torna alla fotocamera" : "cerca per nome"}
          </button>
          <Link
            href="/admin/pr"
            className="flex items-center border border-white/15 px-4 font-tech text-[10px] uppercase tracking-[0.2em] text-brand-gray"
          >
            esci
          </Link>
        </div>
        {listaPronta && inCoda === 0 && (
          <button
            onClick={() => {
              if (
                window.confirm(
                  "Cancellare la lista dal telefono?\n\n" +
                    "Falla a fine serata: dentro ci sono i nomi delle persone, ed è giusto " +
                    "che non restino sul telefono di nessuno.",
                )
              ) {
                svuota();
                setListaPronta(null);
                setLocaleEntrati(null);
              }
            }}
            className="mt-2 w-full py-2 font-tech text-[9px] uppercase tracking-[0.2em] text-brand-gray hover:text-white"
          >
            fine serata · cancella la lista dal telefono
          </button>
        )}

        {(riepilogo?.non_pagati ?? 0) > 0 && (
          <p className="mt-2 text-center text-[11px] text-amber-300">
            {riepilogo?.non_pagati} biglietti non ancora pagati dai PR: se arrivano, chiama Luka.
          </p>
        )}
      </div>
    </main>
  );
}

/** L'esito a tutto schermo: si deve capire da lontano e di fretta. */
function Risposta({
  esito,
  sonoAdmin,
  onForza,
  onChiudi,
}: {
  esito: Esito;
  sonoAdmin: boolean;
  onForza: (id: string) => void;
  onChiudi: () => void;
}) {
  const nome = [esito.nome, esito.cognome].filter(Boolean).join(" ");

  const stile = {
    ok: { sfondo: "bg-emerald-500", testo: "PASSA", colore: "text-black" },
    gia_usato: { sfondo: "bg-brand-red", testo: "GIÀ ENTRATO", colore: "text-white" },
    non_pagato: { sfondo: "bg-amber-400", testo: "NON PAGATO", colore: "text-black" },
    annullato: { sfondo: "bg-brand-red", testo: "ANNULLATO", colore: "text-white" },
    altra_serata: { sfondo: "bg-amber-400", testo: "ALTRA SERATA", colore: "text-black" },
    sconosciuto: { sfondo: "bg-neutral-700", testo: "NON È UN BIGLIETTO", colore: "text-white" },
    // Verde come un biglietto valido, ma la scritta dice che è uno
    // della crew: in porta si capisce chi sta entrando e con che
    // diritto, senza chiedere niente a nessuno.
    pr_ok: { sfondo: "bg-emerald-500", testo: "PASSA · PR", colore: "text-black" },
    pr_non_attivo: {
      sfondo: "bg-amber-400",
      testo: "PR SENZA INGRESSO",
      colore: "text-black",
    },
  }[esito.esito];

  return (
    <button
      onClick={onChiudi}
      className={`absolute inset-0 flex w-full flex-col items-center justify-center px-6 text-center ${stile.sfondo} ${stile.colore}`}
    >
      <p className="font-display text-5xl uppercase leading-none">{stile.testo}</p>

      {nome && (
        <p className="mt-5 font-display text-3xl uppercase leading-tight">{nome}</p>
      )}

      {esito.tier_label && (
        <p className="mt-2 font-tech text-xs uppercase tracking-[0.2em] opacity-80">
          {esito.tier_label}
          {esito.pr_alias ? ` · ${esito.pr_alias}` : ""}
        </p>
      )}

      {esito.esito === "gia_usato" && esito.entrata_at && (
        <p className="mt-4 text-sm opacity-90">
          È passato alle {ora(esito.entrata_at)}
        </p>
      )}

      {esito.esito === "altra_serata" && esito.evento && (
        <p className="mt-4 max-w-xs text-sm opacity-90">
          Questo biglietto è per <strong>{esito.evento}</strong>, non per stasera.
        </p>
      )}

      {esito.esito === "sconosciuto" && (
        <p className="mt-4 max-w-xs text-sm opacity-80">
          Questo QR non è una prevendita. Se è il pass di un membro, si entra normalmente.
        </p>
      )}

      {esito.esito === "pr_non_attivo" && (
        <p className="mt-4 max-w-[24ch] text-sm leading-relaxed">
          Non ha ancora fatto le prevendite che servono ({esito.tier_label}). Paga
          l&apos;ingresso o lo sblocca Luka dal pannello.
        </p>
      )}

      {esito.esito === "pr_ok" && (
        <p className="mt-4 max-w-[24ch] text-sm leading-relaxed">
          È della crew e ha fatto i suoi numeri. Il pass vale una volta sola.
        </p>
      )}

      {esito.esito === "non_pagato" && (
        <>
          <p className="mt-4 max-w-xs text-sm leading-relaxed">
            Il suo PR non ha ancora consegnato i soldi. Il cliente probabilmente ha pagato:
            non è colpa sua.
          </p>
          {sonoAdmin && esito.presale_id && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onForza(esito.presale_id!);
              }}
              className="mt-5 border-2 border-black px-6 py-4 text-[12px] font-semibold uppercase tracking-widest"
            >
              fallo entrare lo stesso
            </span>
          )}
          {!sonoAdmin && (
            <p className="mt-4 font-display text-xl uppercase">Chiama Luka</p>
          )}
        </>
      )}

      {esito.esito === "ok" && esito.under16 && (
        <div className="mt-5 border-2 border-black px-5 py-3">
          <p className="font-display text-2xl uppercase leading-none">Meno di 16 anni</p>
          <p className="mt-1 text-[12px] font-semibold">Documento + delega firmata</p>
        </div>
      )}

      {esito.esito === "ok" && esito.minorenne && !esito.under16 && (
        <div className="mt-5 border-2 border-black px-5 py-2">
          <p className="font-display text-xl uppercase leading-none">Minorenne · documento</p>
        </div>
      )}

      <p className="mt-8 font-tech text-[10px] uppercase tracking-[0.25em] opacity-60">
        tocca per continuare
      </p>
    </button>
  );
}
