"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Prize = {
  id: string;
  label: string;
  emoji: string;
  weight: number;
  stock: number | null;
  enabled: boolean;
  assigned: number;
};

type Winner = {
  alias: string;
  member_number: number;
  emoji: string;
  label: string;
  drawn_at: string;
};

type Dashboard = {
  prizes: Prize[];
  total_draws: number;
  won_draws: number;
  winners: Winner[];
};

export default function AdminRegaliPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetNum, setResetNum] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  // bozza modificabile per riga (id -> {stock, weight, enabled})
  const [draft, setDraft] = useState<Record<string, { stock: string; weight: string; enabled: boolean }>>({});

  async function load() {
    const supabase = createClient();
    const { data: res, error: err } = await supabase.rpc("admin_prize_dashboard");
    if (err) {
      setError("Non disponibile. Hai incollato supabase/regali.sql nel SQL Editor? (" + err.message + ")");
      setLoading(false);
      return;
    }
    const d = res as Dashboard;
    setData(d);
    setDraft((prev) => {
      const next = { ...prev };
      for (const p of d.prizes) {
        if (!next[p.id]) {
          next[p.id] = {
            stock: p.stock === null ? "" : String(p.stock),
            weight: String(p.weight),
            enabled: p.enabled,
          };
        }
      }
      return next;
    });
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { router.replace("/admin/login"); return; }
      load();
    })();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function saveRow(id: string) {
    const d = draft[id];
    if (!d) return;
    setSaving(id);
    const supabase = createClient();
    const stock = d.stock.trim() === "" ? null : Math.max(0, parseInt(d.stock, 10) || 0);
    const weight = Math.max(0, parseFloat(d.weight) || 0);
    const { error: err } = await supabase.rpc("admin_set_prize", {
      p_id: id,
      p_stock: stock,
      p_weight: weight,
      p_enabled: d.enabled,
    });
    if (err) setError("Errore salvataggio: " + err.message);
    await load();
    setSaving(null);
  }

  function setField(id: string, field: "stock" | "weight" | "enabled", value: string | boolean) {
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function resetDraw(memberNumber: number, fromInput: boolean) {
    if (!memberNumber) return;
    if (!confirm(`Ridare un tiro al membro #${String(memberNumber).padStart(4, "0")}? L'estrazione attuale verrà annullata.`)) return;
    setResetting(true);
    setResetMsg(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("admin_reset_prize", { p_member_number: memberNumber });
    if (err) {
      setResetMsg("Errore: " + err.message);
    } else {
      const r = data as { ok: boolean; reason?: string; alias?: string };
      if (r.ok) setResetMsg(`✓ ${r.alias} può ri-tirare. Rifagli scansionare il QR.`);
      else if (r.reason === "no_draw") setResetMsg(`${r.alias ?? "Membro"} non ha ancora tirato: niente da annullare.`);
      else setResetMsg("Membro non trovato.");
    }
    if (fromInput) setResetNum("");
    await load();
    setResetting(false);
  }

  // Probabilità reale corrente (sui premi abilitati e con scorta), da bozza.
  const totalWeight = data
    ? data.prizes
        .filter((p) => draft[p.id]?.enabled && draft[p.id]?.stock !== "0")
        .reduce((s, p) => s + (parseFloat(draft[p.id]?.weight ?? "0") || 0), 0)
    : 0;

  return (
    <main className="flex-1 flex flex-col px-4 py-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-brand-red text-3xl">Regali</h1>
          <p className="text-brand-gray text-xs uppercase tracking-widest">Scorte & vincitori</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/admin/scan")}
            className="text-xs uppercase tracking-widest text-brand-red border border-brand-red px-3 py-2 hover:bg-brand-red hover:text-white transition-all"
          >
            Scanner QR
          </button>
          <button
            onClick={() => router.push("/admin/dashboard")}
            className="text-xs uppercase tracking-widest text-brand-gray border border-white/10 px-3 py-2"
          >
            Dashboard
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 border border-brand-red/50 bg-brand-red/10 p-3 text-brand-red text-xs">
          {error}
        </div>
      )}

      {loading && <p className="text-brand-gray text-sm animate-pulse-glow">Caricamento…</p>}

      {data && (
        <>
          {/* Riepilogo */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="border border-white/10 p-4 text-center">
              <p className="font-display text-white text-3xl">{data.won_draws}</p>
              <p className="text-brand-gray text-[11px] uppercase tracking-widest mt-1">premi assegnati</p>
            </div>
            <div className="border border-white/10 p-4 text-center">
              <p className="font-display text-white text-3xl">{data.total_draws}</p>
              <p className="text-brand-gray text-[11px] uppercase tracking-widest mt-1">estrazioni fatte</p>
            </div>
          </div>

          <p className="text-brand-gray text-xs mb-3">
            <strong className="text-white">Scorta</strong> = pezzi rimasti (vuoto = illimitato).{" "}
            <strong className="text-white">Peso</strong> = probabilità relativa. Salva ogni riga dopo la modifica.
          </p>

          {/* Righe premio */}
          <div className="flex flex-col gap-2 mb-8">
            {data.prizes.map((p) => {
              const d = draft[p.id] ?? { stock: "", weight: "0", enabled: true };
              const isNiente = p.id === "niente";
              const pct = d.enabled && d.stock !== "0" && totalWeight > 0
                ? ((parseFloat(d.weight) || 0) / totalWeight) * 100
                : 0;
              const soldOut = p.stock === 0;
              return (
                <div
                  key={p.id}
                  className={`border p-3 ${soldOut ? "border-white/5 opacity-60" : "border-white/10"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{p.emoji}</span>
                      <div>
                        <p className="text-white text-sm font-semibold tracking-wide">{p.label}</p>
                        <p className="text-brand-gray text-[11px]">
                          assegnati: {p.assigned}
                          {p.stock !== null && ` · rimasti: ${p.stock}`}
                          {soldOut && " · ESAURITO"}
                          {!isNiente && ` · ~${pct.toFixed(1)}%`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => saveRow(p.id)}
                      disabled={saving === p.id}
                      className="text-[11px] uppercase tracking-widest text-brand-red border border-brand-red px-3 py-1.5 hover:bg-brand-red hover:text-white transition-all disabled:opacity-40"
                    >
                      {saving === p.id ? "…" : "Salva"}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {!isNiente && (
                      <label className="text-[11px] text-brand-gray flex items-center gap-1">
                        Scorta
                        <input
                          type="number"
                          min={0}
                          value={d.stock}
                          onChange={(e) => setField(p.id, "stock", e.target.value)}
                          placeholder="∞"
                          className="w-16 bg-black/40 border border-white/15 px-2 py-1 text-white text-sm text-center"
                        />
                      </label>
                    )}
                    <label className="text-[11px] text-brand-gray flex items-center gap-1">
                      Peso
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        value={d.weight}
                        onChange={(e) => setField(p.id, "weight", e.target.value)}
                        className="w-16 bg-black/40 border border-white/15 px-2 py-1 text-white text-sm text-center"
                      />
                    </label>
                    <label className="text-[11px] text-brand-gray flex items-center gap-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={d.enabled}
                        onChange={(e) => setField(p.id, "enabled", e.target.checked)}
                      />
                      attivo
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ridai un tiro */}
          <div className="border border-white/10 p-4 mb-8">
            <p className="text-white text-sm font-semibold mb-1">Ridai un tiro</p>
            <p className="text-brand-gray text-[11px] mb-3">
              Annulla l&apos;estrazione di un membro (numero sulla card) così può farsi riscansionare. Il premio annullato torna in scorta.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={resetNum}
                onChange={(e) => setResetNum(e.target.value)}
                placeholder="n° membro"
                className="w-28 bg-black/40 border border-white/15 px-3 py-2 text-white text-sm"
              />
              <button
                onClick={() => resetDraw(parseInt(resetNum, 10) || 0, true)}
                disabled={resetting || !resetNum}
                className="text-xs uppercase tracking-widest text-brand-red border border-brand-red px-4 py-2 hover:bg-brand-red hover:text-white transition-all disabled:opacity-40"
              >
                {resetting ? "…" : "↺ Ridai tiro"}
              </button>
            </div>
            {resetMsg && <p className="text-brand-gray text-xs mt-2">{resetMsg}</p>}
          </div>

          {/* Vincitori */}
          <h2 className="font-display text-white text-xl mb-3">Vincitori</h2>
          {data.winners.length === 0 ? (
            <p className="text-brand-gray text-sm">Ancora nessun premio assegnato.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {data.winners.map((w, i) => (
                <div key={i} className="flex items-center justify-between border border-white/10 px-3 py-2">
                  <span className="text-white text-sm">
                    {w.emoji} {w.label}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-brand-gray text-xs">
                      {w.alias} · #{String(w.member_number).padStart(4, "0")}
                    </span>
                    <button
                      onClick={() => resetDraw(w.member_number, false)}
                      disabled={resetting}
                      title="Ridai un tiro"
                      className="text-brand-gray hover:text-brand-red transition-colors text-sm disabled:opacity-40"
                    >
                      ↺
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
