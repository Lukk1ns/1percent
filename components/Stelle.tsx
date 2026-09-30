import { giornoEData } from "@/lib/eventi";
import {
  ORDINALI,
  PUNTI_PER_VENDITA,
  SOGLIE_STELLE,
  fmtPunti,
  statoStelle,
} from "@/lib/punti";

/**
 * Le stelle dei PR (30 settembre 2026): la grafica scelta da Luka fra
 * stelle, luci e tacche. Cinque stelle, quella in corso si riempie da
 * sinistra a destra man mano che il PR vende. Soglie in `lib/punti.ts`.
 */

const PUNTE =
  "12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26";

/** Una stella: vuota, piena, o piena solo in parte. */
function Stella({ quota, presa, className = "" }: { quota: number; presa: boolean; className?: string }) {
  return (
    <span className={`relative block aspect-square ${className}`}>
      <svg viewBox="0 0 24 24" aria-hidden className="absolute inset-0 h-full w-full">
        <polygon
          points={PUNTE}
          fill="#171717"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth={0.7}
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="absolute inset-0"
        style={{
          clipPath: `inset(0 ${(100 - quota * 100).toFixed(1)}% 0 0)`,
          transition: "clip-path 0.7s cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="h-full w-full"
          style={presa ? { filter: "drop-shadow(0 0 5px rgba(224,24,31,0.75))" } : undefined}
        >
          <polygon
            points={PUNTE}
            fill="#e0181f"
            stroke="#ff5a60"
            strokeWidth={0.5}
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </span>
  );
}

/** Le cinque stelle in fila, per chi ha fatto `vendite` prevendite. */
export function CinqueStelle({
  vendite,
  grandezza = "w-4",
  soglie = false,
}: {
  vendite: number;
  /** Classe di larghezza di ogni stella (es. "w-4" nella classifica). */
  grandezza?: string;
  /** Scrive sotto ogni stella i punti che la accendono. */
  soglie?: boolean;
}) {
  const st = statoStelle(vendite);
  return (
    <div
      className={soglie ? "flex gap-2" : "flex gap-0.5"}
      role="img"
      aria-label={`${st.stelle} stelle su 5`}
    >
      {SOGLIE_STELLE.map((s, i) => {
        const quota = i < st.stelle ? 1 : i === st.stelle ? st.quota : 0;
        return soglie ? (
          <div key={s} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <Stella quota={quota} presa={i < st.stelle} className={grandezza} />
            <span
              className={`font-tech text-[9px] tabular-nums tracking-[0.06em] ${
                i < st.stelle ? "text-white" : "text-white/35"
              }`}
            >
              {fmtPunti(s)}
            </span>
          </div>
        ) : (
          <Stella key={s} quota={quota} presa={i < st.stelle} className={grandezza} />
        );
      })}
    </div>
  );
}

/**
 * Il profilo del PR, in cima all'area PR. Vede solo i suoi numeri:
 * niente classifica e niente posizione, per scelta di Luka.
 */
export function ProfiloStelle({
  alias,
  numero,
  vendite,
  serata,
}: {
  alias: string;
  numero: number | null;
  /** Vendite valide da sempre, tutte le serate. */
  vendite: number;
  /** La serata più vicina su cui lavora, con le sue vendite. */
  serata: { nome: string; startsAt: string; vendite: number; accento: string } | null;
}) {
  const st = statoStelle(vendite);
  return (
    <section className="relative overflow-hidden border border-brand-red/30 bg-[#080808] px-[18px] pb-[18px] pt-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-tech text-[10px] uppercase tracking-[0.32em] text-brand-gray">
            il tuo profilo
          </p>
          <p className="mt-2 font-display text-[38px] uppercase leading-none text-white [overflow-wrap:anywhere]">
            {alias}
          </p>
          {numero != null && (
            <p className="mt-2 font-tech text-[9px] uppercase tracking-[0.3em] text-brand-gray">
              crew · #{String(numero).padStart(4, "0")}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 pt-[18px] text-right">
          <p className="led-digits text-4xl leading-none">{fmtPunti(st.punti)}</p>
          <p className="mt-1.5 font-tech text-[9px] uppercase tracking-[0.18em] text-brand-gray">
            punti in tutto
          </p>
        </div>
      </div>

      <div className="mt-6">
        <CinqueStelle vendite={vendite} grandezza="w-full max-w-14" soglie />
      </div>

      <h2 className="mt-4 font-display text-[26px] font-normal uppercase leading-[1.05] text-white">
        {st.stelle === 1 ? "1 stella" : `${st.stelle} stelle`}
      </h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-brand-gray">
        {st.prossima === null ? (
          "Hai tutte e cinque le stelle."
        ) : (
          <>
            La {ORDINALI[st.stelle]} si accende a{" "}
            <strong className="font-semibold text-white">{fmtPunti(st.prossima)} punti</strong>: ti{" "}
            {st.mancano === 1 ? "manca 1 vendita" : `mancano ${st.mancano} vendite`}.
          </>
        )}
      </p>

      {serata && (
        <div
          className="mt-4 flex items-end justify-between gap-3 border-l-4 bg-white/[0.02] px-3.5 py-3"
          style={{ borderLeftColor: serata.accento }}
        >
          <div className="min-w-0">
            <p
              className="font-tech text-[10px] uppercase tracking-[0.3em]"
              style={{ color: serata.accento }}
            >
              {giornoEData(serata.startsAt)}
            </p>
            <p className="mt-1 font-display text-lg uppercase leading-none text-white [overflow-wrap:anywhere]">
              {serata.nome}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-end gap-5 text-right">
            <div>
              <p className="led-digits text-2xl leading-none">
                {fmtPunti(serata.vendite * PUNTI_PER_VENDITA)}
              </p>
              <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                punti serata
              </p>
            </div>
            <div>
              <p className="font-display text-2xl leading-none text-white">{serata.vendite}</p>
              <p className="mt-1 font-tech text-[9px] uppercase tracking-[0.15em] text-brand-gray">
                vendite
              </p>
            </div>
          </div>
        </div>
      )}

      <p className="mt-3.5 text-[11px] leading-relaxed text-brand-gray">
        Ogni prevendita che fai vale {PUNTI_PER_VENDITA} punti. Se un biglietto viene annullato, i
        suoi punti tornano indietro.
      </p>
    </section>
  );
}

/**
 * Subito dopo una vendita, nella schermata "fatto": i punti appena
 * presi e, se è scattata, la stella nuova. Non compare se i punti non
 * sono cambiati (una fascia a zero euro, o lo script non ancora dentro).
 */
export function PiuPunti({ prima, dopo }: { prima: number | null; dopo: number | null }) {
  if (prima === null || dopo === null || dopo <= prima) return null;
  const st = statoStelle(dopo);
  const nuova = st.stelle > statoStelle(prima).stelle;
  return (
    <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-3.5 gap-y-2 border border-brand-red/45 bg-brand-red/[0.07] px-3.5 py-3">
      <p className="row-span-2 font-display text-[32px] leading-none text-[#ff5a60] [text-shadow:0_0_12px_rgba(224,24,31,0.75)]">
        +{(dopo - prima) * PUNTI_PER_VENDITA}
        <span className="block font-tech text-[9px] tracking-[0.2em] text-brand-gray [text-shadow:none]">
          PUNTI
        </span>
      </p>
      <p className="min-w-0 text-[12px] leading-snug text-white">
        {nuova ? (
          <>
            <strong className="font-semibold text-[#ff5a60]">
              Hai preso la {ORDINALI[st.stelle - 1]} stella!
            </strong>{" "}
            Ora sei a {fmtPunti(st.punti)} punti.
          </>
        ) : st.prossima === null ? (
          `Ora sei a ${fmtPunti(st.punti)} punti · hai tutte e cinque le stelle.`
        ) : (
          `Ora sei a ${fmtPunti(st.punti)} punti · la ${ORDINALI[st.stelle]} stella a ${fmtPunti(st.prossima)}.`
        )}
      </p>
      <div className="h-1 overflow-hidden bg-white/10">
        <div className="h-1 bg-brand-red" style={{ width: `${(st.quota * 100).toFixed(1)}%` }} />
      </div>
    </div>
  );
}
