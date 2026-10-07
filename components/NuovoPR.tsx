"use client";

import { useState } from "react";
import { createClient as creaClientSupabase } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { normalizzaNumero } from "@/lib/whatsapp";

/**
 * Un PR aggiunto a mano dal pannello (7 ott).
 *
 * Luka: "devo poter aggiungere io direttamente un PR nuovo e attivarlo
 * con le prevendite, mandandogli il messaggio, senza dirgli di
 * iscriversi dal sito e fare tutto il percorso".
 *
 * Nessuno script nuovo: si rifà da qui il giro di sempre. Un accesso
 * anonimo usa e getta (un client a parte, che non tocca la sessione di
 * Luka) crea il profilo con `join_public` come una candidatura, poi Luka
 * la approva con `admin_approve_crew` sulla serata scelta: agganci e
 * prevendite di partenza sono quelli dell'approvazione normale.
 * Il PR entra poi con la sua mail e il codice: `link_email_account`
 * riattacca il profilo al suo accesso, come per chiunque rientri.
 *
 * Se la mail è già iscritta (un cliente, un candidato) non si crea un
 * doppione: si promuove quel profilo.
 */

type SerataFutura = { event_id: string; nome: string; starts_at: string };

export type PrAggiunto = {
  id: string;
  chi: string;
  saluto: string;
  info: string;
  telefono: string | null;
  serata: string | null;
  email: string;
};

type Iscritto = {
  id: string;
  alias: string;
  member_number: number;
  email: string | null;
  role: string;
  crew_request_status: string | null;
  nome: string | null;
};

const ALIAS_OK = /^[a-z0-9_.-]{2,}$/;

/** "Marco De Rossi" → "marco.d": niente nome intero sul Muro. */
function aliasDaNome(nome: string): string {
  const parole = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  if (parole.length === 0) return "";
  const [primo, ...resto] = parole;
  return resto.length ? `${primo}.${resto[resto.length - 1][0]}` : primo;
}

/** La risposta dell'approvazione: "ok:<quanti>:<serata>". */
function leggiApprovazione(data: unknown, serataScelta: string | null) {
  const [, quanti, serata] = String(data ?? "").split(":");
  const n = Number(quanti ?? 0);
  const nome = serata || serataScelta || null;
  return {
    serata: nome,
    info:
      n > 0
        ? `Agganciato a ${nome}: gli ho già consegnato ${n} prevendite.`
        : nome
        ? `Agganciato a ${nome}. Blocchetti non consegnati (ne aveva già, o le prevendite di partenza sono a zero): glieli dai tu da /admin/pr.`
        : `Non c'è nessuna serata in programma: quando la crei, agganciaglielo da /admin/pr.`,
  };
}

export function NuovoPR({
  serate,
  onFatto,
}: {
  serate: SerataFutura[];
  onFatto: (pr: PrAggiunto) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [nome, setNome] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [alias, setAlias] = useState("");
  const [serata, setSerata] = useState("");
  const [lavorando, setLavorando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const serataId = serata || serate[0]?.event_id || null;
  const nomeSerata = serate.find((s) => s.event_id === serataId)?.nome ?? null;
  const aliasProposto = aliasDaNome(nome);

  function pulisci() {
    setNome("");
    setTelefono("");
    setEmail("");
    setAlias("");
    setSerata("");
    setErrore(null);
  }

  async function crea(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);

    const nomeVero = nome.trim().replace(/\s+/g, " ");
    const tel = normalizzaNumero(telefono);
    const mail = email.trim().toLowerCase();
    if (nomeVero.length < 2) return setErrore("Scrivi nome e cognome.");
    if (!tel) {
      return setErrore("Il numero WhatsApp non è giusto (se non è italiano, col prefisso +).");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      return setErrore("La mail non è giusta: è quella con cui entrerà nel sito.");
    }
    const aliasScelto = alias.trim().toLowerCase();
    if (aliasScelto && !ALIAS_OK.test(aliasScelto)) {
      return setErrore("Alias: almeno 2 caratteri, solo lettere, numeri, punto, - e _.");
    }

    setLavorando(true);
    const supabase = createClient();
    const saluto = nomeVero.split(" ")[0];

    try {
      const { data: tutti, error: errTutti } = await supabase.rpc("admin_members");
      if (errTutti) throw new Error(errTutti.message);
      const iscritti = (tutti ?? []) as Iscritto[];
      const giaDentro = iscritti.find((m) => (m.email ?? "").trim().toLowerCase() === mail);

      // La mail c'è già: si promuove quel profilo, non se ne fa un altro.
      if (giaDentro) {
        const tessera = `#${String(giaDentro.member_number).padStart(4, "0")}`;
        if (giaDentro.role === "crew") {
          setErrore(
            `Questa mail è già di un PR: ${giaDentro.nome ?? giaDentro.alias} (${giaDentro.alias} ${tessera}). ` +
              `Per farlo vendere su un'altra serata: Prevendite → scheda PR → aggancia.`,
          );
          return;
        }
        const cosE =
          giaDentro.crew_request_status === "in_attesa" ? "candidato in attesa" : "iscritto come cliente";
        if (
          !confirm(
            `Questa mail è già sul sito: ${giaDentro.alias} ${tessera}, ${cosE}.\n\n` +
              `Lo faccio diventare PR` +
              (nomeSerata ? ` per ${nomeSerata}` : "") +
              ` col numero ${tel}?`,
          )
        ) {
          return;
        }
        const { error: errNum } = await supabase.rpc("admin_set_numero", {
          p_profile: giaDentro.id,
          p_numero: tel,
        });
        if (errNum) throw new Error(errNum.message);
        const { data, error } = await supabase.rpc(
          "admin_approve_crew",
          serataId ? { p_profile: giaDentro.id, p_event: serataId } : { p_profile: giaDentro.id },
        );
        if (error) throw new Error(error.message);
        onFatto({
          id: giaDentro.id,
          chi: giaDentro.nome ?? nomeVero,
          saluto,
          telefono: tel,
          email: mail,
          ...leggiApprovazione(data, nomeSerata),
        });
        pulisci();
        setAperto(false);
        return;
      }

      // Alias libero: quello scritto, o quello proposto col numerino.
      const presi = new Set(iscritti.map((m) => m.alias.toLowerCase()));
      let aliasFinale = aliasScelto;
      if (aliasFinale) {
        if (presi.has(aliasFinale)) {
          setErrore(`L'alias "${aliasFinale}" è già preso: scegline un altro, o lascialo vuoto.`);
          return;
        }
      } else {
        const base = aliasProposto.length >= 2 ? aliasProposto : "pr";
        aliasFinale = base;
        for (let i = 2; presi.has(aliasFinale); i++) aliasFinale = `${base}${i}`;
      }

      // Un accesso usa e getta, tutto suo: la sessione di Luka non si tocca.
      const usaEGetta = creaClientSupabase(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: "pr-a-mano",
          },
        },
      );
      const { data: sessione, error: errAnon } = await usaEGetta.auth.signInAnonymously();
      if (errAnon || !sessione.user) throw new Error(errAnon?.message ?? "accesso non riuscito");
      const nuovoId = sessione.user.id;

      const { error: errJoin } = await usaEGetta.rpc("join_public", {
        p_alias: aliasFinale,
        p_avatar_id: null,
        p_nome: nomeVero,
        p_email: mail,
        p_gender: null,
        p_quiz_answers: null,
        p_referral_code: null,
        p_crew_request: true,
        // Niente questionario: lo dice la sua scheda nello staff.
        p_crew_answers: { a_mano: new Date().toISOString() },
        p_telefono: tel,
      });
      usaEGetta.auth.signOut().catch(() => {});
      if (errJoin) {
        const m = errJoin.message ?? "";
        if (m.includes("numero_gia_usato")) {
          setErrore("Questo numero WhatsApp è già di un altro iscritto: cercalo qui sotto.");
        } else if (m.includes("numero_non_valido")) {
          setErrore("Il numero WhatsApp non è giusto (se non è italiano, col prefisso +).");
        } else if (m.includes("alias")) {
          setErrore("Alias appena preso da qualcun altro: riprova.");
        } else if (m.toLowerCase().includes("mail")) {
          setErrore("Questa mail è appena stata iscritta: ricarica la pagina e riprova.");
        } else {
          throw new Error(m);
        }
        return;
      }

      const { data, error } = await supabase.rpc(
        "admin_approve_crew",
        serataId ? { p_profile: nuovoId, p_event: serataId } : { p_profile: nuovoId },
      );
      if (error) {
        setErrore(
          `Creato ma non attivato (${error.message}): lo trovi fra le candidature in attesa, ` +
            `premi "Fallo entrare".`,
        );
        return;
      }

      onFatto({
        id: nuovoId,
        chi: nomeVero,
        saluto,
        telefono: tel,
        email: mail,
        ...leggiApprovazione(data, nomeSerata),
      });
      pulisci();
      setAperto(false);
    } catch (err) {
      setErrore("Non è andata: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLavorando(false);
    }
  }

  if (!aperto) {
    return (
      <button
        onClick={() => setAperto(true)}
        className="mb-8 w-full border border-emerald-400/50 py-4 text-[11px] font-semibold uppercase tracking-widest text-emerald-400 hover:bg-emerald-400/5"
      >
        + Aggiungi un PR a mano
      </button>
    );
  }

  const campo =
    "w-full border border-white/15 bg-black px-3 py-3 text-sm text-white placeholder-brand-gray/50 outline-none focus:border-emerald-400";

  return (
    <form onSubmit={crea} className="mb-8 border border-emerald-400/50 px-4 py-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="text-xs uppercase tracking-widest text-emerald-400">Nuovo PR</p>
        <button
          type="button"
          onClick={() => {
            pulisci();
            setAperto(false);
          }}
          className="text-[10px] uppercase tracking-widest text-brand-gray hover:text-white"
        >
          chiudi
        </button>
      </div>
      <p className="mb-5 text-[11px] leading-relaxed text-brand-gray">
        Entra subito nello staff, senza iscrizione né domande, con le prevendite di partenza sulla
        serata scelta. Poi parte il benvenuto su WhatsApp con la mail con cui entra nel sito.
      </p>

      <div className="flex flex-col gap-3">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-brand-gray">
            nome e cognome
          </span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="off"
            className={campo}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-brand-gray">
            numero WhatsApp
          </span>
          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            type="tel"
            inputMode="tel"
            placeholder="347 123 4567"
            autoComplete="off"
            className={campo}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-brand-gray">
            mail · con questa entra nel sito (gli arriva un codice)
          </span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoComplete="off"
            className={campo}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-brand-gray">
            alias · facoltativo
          </span>
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            autoCapitalize="none"
            autoComplete="off"
            placeholder={aliasProposto ? `se lo lasci vuoto: ${aliasProposto}` : "se lo lasci vuoto lo faccio io"}
            className={campo}
          />
        </label>
        {serate.length > 0 ? (
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-widest text-brand-gray">
              vende solo per
            </span>
            <select
              value={serataId ?? ""}
              onChange={(e) => setSerata(e.target.value)}
              className={campo}
            >
              {serate.map((s) => (
                <option key={s.event_id} value={s.event_id}>
                  {s.nome} ·{" "}
                  {new Date(s.starts_at).toLocaleDateString("it-IT", {
                    day: "numeric",
                    month: "short",
                  })}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-[11px] text-amber-300">
            Nessuna serata in programma: entra nello staff, la serata gliela agganci dopo.
          </p>
        )}
      </div>

      {errore && <p className="mt-4 text-xs leading-relaxed text-brand-red">{errore}</p>}

      <button
        type="submit"
        disabled={lavorando}
        className="mt-5 w-full bg-emerald-500 py-4 text-sm font-semibold uppercase tracking-widest text-black disabled:opacity-40"
      >
        {lavorando ? "…" : "Crea e attiva"}
      </button>
    </form>
  );
}
