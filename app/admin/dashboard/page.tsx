"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getAvatar } from "@/lib/avatars";
import { QUIZ_QUESTIONS } from "@/lib/quiz";

type HybridAnswer = { text?: string; tag?: string };
// q1/q2 sono a scelta, ma da luglio si può anche scrivere la propria
// risposta: in quel caso arriva un oggetto invece di una stringa.
type ChoiceAnswer = string | HybridAnswer;
type QuizAnswers = {
  q1?: ChoiceAnswer;
  q2?: ChoiceAnswer;
  q3?: HybridAnswer;
  q4?: HybridAnswer;
  archetype?: string;
};

/** L'opzione scelta, comunque sia arrivata. */
function optionId(a?: ChoiceAnswer): string | undefined {
  return typeof a === "string" ? a : a?.tag || undefined;
}

/** Quello che ha scritto di suo in una domanda a scelta, se l'ha fatto. */
function freeText(a?: ChoiceAnswer): string | undefined {
  return typeof a === "object" ? a?.text?.trim() || undefined : undefined;
}

type AnswerMember = {
  id: string;
  alias: string;
  avatar_id: string | null;
  member_number: number;
  quiz_answers: QuizAnswers | null;
  created_at: string;
};

// Testo leggibile di una risposta a scelta multipla (q1/q2).
function choiceLabel(qId: string, optId?: string): string {
  const q = QUIZ_QUESTIONS.find((x) => x.id === qId);
  if (!q || q.type !== "choice" || !optId) return "—";
  return q.options.find((o) => o.id === optId)?.text ?? "—";
}

function questionText(qId: string): string {
  return QUIZ_QUESTIONS.find((x) => x.id === qId)?.text ?? qId;
}

// C'è testo libero scritto da qualche parte?
function hasFreeText(a: QuizAnswers | null): boolean {
  return Boolean(
    a?.q3?.text?.trim() || a?.q4?.text?.trim() || freeText(a?.q1) || freeText(a?.q2),
  );
}

type Post = {
  id: string;
  text: string;
  alias: string;
  avatar_id: string;
  created_at: string;
};

type Member = {
  id: string;
  alias: string;
  avatar_id: string | null;
  member_number: number;
  created_at: string;
  email: string | null;
  /* Arrivano da supabase/08_chi_e_chi.sql. Finché non è stato incollato
     restano vuoti e la lista si comporta come prima. */
  role?: string | null;
  crew_request_status?: string | null;
  nome?: string | null;
  invitato_da?: string | null;
};

/** Come è entrato: una parola sola, quella che serve a Luka. */
type Tipo = "crew" | "attesa" | "rifiutato" | "cliente";

function tipoDi(m: Member): Tipo {
  if (m.role === "crew") return "crew";
  if (m.crew_request_status === "in_attesa") return "attesa";
  if (m.crew_request_status === "rifiutata") return "rifiutato";
  return "cliente";
}

const ETICHETTE: Record<Tipo, { testo: string; classe: string }> = {
  crew: { testo: "staff", classe: "text-brand-red border-brand-red/50 bg-brand-red/10" },
  attesa: { testo: "si è candidato", classe: "text-amber-300 border-amber-300/40 bg-amber-300/10" },
  rifiutato: { testo: "rifiutato", classe: "text-white/40 border-white/15" },
  cliente: { testo: "cliente", classe: "text-sky-300/80 border-sky-300/30 bg-sky-300/5" },
};

const FILTRI: { id: Tipo | "tutti"; testo: string }[] = [
  { id: "tutti", testo: "tutti" },
  { id: "crew", testo: "staff" },
  { id: "attesa", testo: "candidati" },
  { id: "cliente", testo: "clienti" },
  { id: "rifiutato", testo: "rifiutati" },
];

type Report = {
  id: string;
  reporter_alias: string;
  reported_alias: string;
  reported_id: string;
  reported_number: number;
  reason: string;
  status: string;
  created_at: string;
};

type Stats = {
  total: number;
  today: number;
  yesterday: number;
  last7: number;
  with_email: number;
  with_photo: number;
  male: number;
  female: number;
  checked_in: number;
  from_referral: number;
  daily: { d: string; n: number }[];
  top_referrers: { alias: string; n: number }[];
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"members" | "stats" | "posts" | "answers" | "reports">("members");
  const [stats, setStats] = useState<Stats | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [filtro, setFiltro] = useState<Tipo | "tutti">("tutti");
  const [answerMembers, setAnswerMembers] = useState<AnswerMember[]>([]);
  const [onlyWritten, setOnlyWritten] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [approvedPosts, setApprovedPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAlias, setEditAlias] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null = non ancora caricato (o script SQL non incollato)
  const [signupsOpen, setSignupsOpen] = useState<boolean | null>(null);

  async function load() {
    const supabase = createClient();
    const [membersRes, postsRes, approvedRes, answersRes, reportsRes, statsRes, signupsRes] = await Promise.all([
      supabase.rpc("admin_members"),
      supabase.rpc("admin_pending_posts"),
      supabase.rpc("approved_posts"),
      supabase.rpc("admin_quiz_answers"),
      supabase.rpc("admin_reports"),
      supabase.rpc("admin_stats"),
      supabase.rpc("signups_open"),
    ]);
    if (!signupsRes.error) setSignupsOpen(signupsRes.data !== false);
    // reportsRes/statsRes possono fallire finché lo script SQL non è stato eseguito: non bloccano il resto
    if (reportsRes.data) setReports(reportsRes.data as Report[]);
    if (statsRes.data) setStats(statsRes.data as Stats);
    if (membersRes.error) setError("Errore membri: " + membersRes.error.message);
    if (membersRes.data) setMembers(membersRes.data as Member[]);
    if (answersRes.data) setAnswerMembers(answersRes.data as AnswerMember[]);
    if (postsRes.error) setError("Errore bacheca: " + postsRes.error.message);
    if (postsRes.data) setPosts(postsRes.data as Post[]);
    if (approvedRes.data) setApprovedPosts(approvedRes.data as Post[]);
    setLoading(false);
  }

  async function handleApprovePost(id: string) {
    setWorking(id);
    const supabase = createClient();
    await supabase.rpc("admin_approve_post", { p_post_id: id });
    await load();
    setWorking(null);
  }

  async function handleRejectPost(id: string) {
    setWorking(id);
    const supabase = createClient();
    await supabase.rpc("admin_reject_post", { p_post_id: id });
    await load();
    setWorking(null);
  }

  async function handleCloseReport(id: string) {
    setWorking(id);
    const supabase = createClient();
    await supabase.rpc("admin_close_report", { p_report: id });
    await load();
    setWorking(null);
  }

  async function handleRemovePhoto(report: Report) {
    if (!confirm(`Rimuovere la foto di ${report.reported_alias}? Tornerà all'emoji.`)) return;
    setWorking(report.id);
    const supabase = createClient();
    // File via Storage API (policy admin), colonne via RPC
    const path = `${report.reported_id}/volto.webp`;
    await Promise.all([
      supabase.storage.from("volti").remove([path]),
      supabase.storage.from("volti-blur").remove([path]),
    ]).catch(() => {});
    await supabase.rpc("admin_remove_photo", { p_profile: report.reported_id });
    await load();
    setWorking(null);
  }

  async function handleRemoveApproved(id: string) {
    if (!confirm("Rimuovere questo post-it dalla bacheca? Sparirà dalla home.")) return;
    setWorking(id);
    const supabase = createClient();
    await supabase.rpc("admin_reject_post", { p_post_id: id });
    await load();
    setWorking(null);
  }

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { router.replace("/admin/login"); return; }
      load();
      // Aggiorna automaticamente ogni 10s così i nuovi post-it compaiono da soli
      interval = setInterval(load, 10000);
    })();
    return () => { if (interval) clearInterval(interval); };
  }, [router]);

  async function handleDelete(id: string, alias: string) {
    if (!confirm(`Elimina "${alias}"? Il QR code verrà revocato.`)) return;
    setWorking(id);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("admin_delete_member", { p_profile_id: id });
    if (err) { setError("Errore delete: " + err.message); setWorking(null); return; }
    await load();
    setWorking(null);
  }

  async function handleSaveAlias(id: string) {
    if (!editAlias.trim()) return;
    setWorking(id);
    const supabase = createClient();
    await supabase.rpc("admin_update_alias", { p_profile_id: id, p_new_alias: editAlias.trim().toLowerCase() });
    setEditingId(null);
    await load();
    setWorking(null);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  async function handleToggleSignups() {
    if (signupsOpen === null) return;
    const closing = signupsOpen;
    if (
      !confirm(
        closing
          ? "Chiudere le iscrizioni? Nessuno potrà più registrarsi finché non le riapri (i membri esistenti entrano normalmente)."
          : "Riaprire le iscrizioni per il prossimo evento?",
      )
    )
      return;
    setWorking("signups");
    const supabase = createClient();
    const { error: err } = await supabase.rpc("admin_set_signups", { p_open: !closing });
    if (err) setError("Errore iscrizioni: " + err.message);
    else setSignupsOpen(!closing);
    setWorking(null);
  }

  return (
    <main className="flex-1 flex flex-col px-4 py-8 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-brand-red text-3xl">Admin</h1>
          <p className="text-brand-gray text-xs uppercase tracking-widest">Dashboard 1%</p>
        </div>
        <div className="flex gap-3">
          {signupsOpen !== null && (
            <button
              onClick={handleToggleSignups}
              disabled={working === "signups"}
              title={signupsOpen ? "Le iscrizioni sono APERTE: tocca per chiuderle" : "Le iscrizioni sono CHIUSE: tocca per riaprirle"}
              className={`text-xs uppercase tracking-widest px-3 py-2 border transition-all disabled:opacity-50 ${
                signupsOpen
                  ? "text-green-400 border-green-400/50 hover:bg-green-400/10"
                  : "text-brand-red border-brand-red hover:bg-brand-red hover:text-white"
              }`}
            >
              {signupsOpen ? "🔓 Iscrizioni aperte" : "🔒 Iscrizioni chiuse"}
            </button>
          )}
          <button
            onClick={handleLogout}
            className="text-xs uppercase tracking-widest text-brand-gray border border-white/10 px-3 py-2 hover:border-white/30 transition-all"
          >
            Esci
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 border border-brand-red/50 bg-brand-red/10 p-3 text-brand-red text-xs">
          {error}
        </div>
      )}

      {/* I pannelli: le porte, scritte grandi e cosa c'è dentro.
          Prima erano bottoncini grigi in alto a destra e non si
          trovavano più. */}
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.4em] text-brand-gray/60 mb-3">
          i pannelli
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          {[
            {
              href: "/admin/eventi",
              emoji: "📅",
              titolo: "Eventi",
              cosa: "Crea le feste, svelale, carica la locandina",
              acceso: true,
            },
            {
              href: "/admin/crew",
              emoji: "👤",
              titolo: "Staff",
              cosa: "Candidature in attesa: approva o rifiuta",
              acceso: false,
            },
            {
              href: "/admin/regali",
              emoji: "🎁",
              titolo: "Regali",
              cosa: "Scorte, probabilità, vincitori",
              acceso: false,
            },
            {
              href: "/admin/scan",
              emoji: "📷",
              titolo: "Scanner QR",
              cosa: "Valida gli ingressi alla serata",
              acceso: false,
            },
            {
              href: "/admin/pr",
              emoji: "🎟️",
              titolo: "Prevendite",
              cosa: "Blocchetti ai PR, incassi, biglietti",
              acceso: false,
            },
          ].map((p) => (
            <button
              key={p.href}
              onClick={() => router.push(p.href)}
              className={`flex flex-col items-start gap-1 border px-4 py-4 text-left transition-all hover:-translate-y-0.5 ${
                p.acceso
                  ? "border-brand-red bg-brand-red/10 hover:bg-brand-red/20"
                  : "border-white/10 hover:border-white/30"
              }`}
            >
              <span className="text-xl leading-none" aria-hidden>
                {p.emoji}
              </span>
              <span className="text-sm font-semibold uppercase tracking-widest text-white">
                {p.titolo}
              </span>
              <span className="text-[11px] leading-snug text-brand-gray/70">{p.cosa}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab */}
      <div className="flex flex-wrap gap-0 mb-8 border border-white/10">
        <button
          onClick={() => setTab("members")}
          className={`flex-1 min-w-[7rem] py-3 text-[11px] sm:text-xs uppercase tracking-widest transition-all ${tab === "members" ? "bg-brand-red text-white" : "text-brand-gray hover:text-white"}`}
        >
          Membri
        </button>
        <button
          onClick={() => setTab("stats")}
          className={`flex-1 min-w-[7rem] py-3 text-[11px] sm:text-xs uppercase tracking-widest transition-all ${tab === "stats" ? "bg-brand-red text-white" : "text-brand-gray hover:text-white"}`}
        >
          Statistiche
        </button>
        <button
          onClick={() => setTab("posts")}
          className={`flex-1 min-w-[7rem] py-3 text-[11px] sm:text-xs uppercase tracking-widest transition-all relative ${tab === "posts" ? "bg-brand-red text-white" : "text-brand-gray hover:text-white"}`}
        >
          Bacheca
          {posts.length > 0 && (
            <span className="absolute top-1 right-3 bg-yellow-400 text-black text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {posts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("answers")}
          className={`flex-1 min-w-[7rem] py-3 text-[11px] sm:text-xs uppercase tracking-widest transition-all ${tab === "answers" ? "bg-brand-red text-white" : "text-brand-gray hover:text-white"}`}
        >
          Risposte
        </button>
        <button
          onClick={() => setTab("reports")}
          className={`flex-1 min-w-[7rem] py-3 text-[11px] sm:text-xs uppercase tracking-widest transition-all relative ${tab === "reports" ? "bg-brand-red text-white" : "text-brand-gray hover:text-white"}`}
        >
          Segnalaz.
          {reports.filter((r) => r.status === "open").length > 0 && (
            <span className="absolute top-1 right-3 bg-yellow-400 text-black text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {reports.filter((r) => r.status === "open").length}
            </span>
          )}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="border border-white/10 p-4">
          <p className="text-xs uppercase tracking-widest text-brand-gray mb-1">Membri totali</p>
          <p className="font-display text-brand-red text-4xl">{members.length}</p>
        </div>
        <div className="border border-white/10 p-4">
          <p className="text-xs uppercase tracking-widest text-brand-gray mb-1">Oggi</p>
          <p className="font-display text-brand-red text-4xl">
            {members.filter(m => new Date(m.created_at).toDateString() === new Date().toDateString()).length}
          </p>
        </div>
      </div>

      {/* Statistiche */}
      {tab === "stats" && (() => {
        if (!stats) {
          return (
            <p className="text-brand-gray/40 text-sm">
              {loading ? "Caricamento…" : (
                <>Statistiche non disponibili. Se è la prima volta, esegui lo script{" "}
                <span className="text-brand-gray">supabase/admin_stats.sql</span>{" "}
                nel SQL Editor di Supabase.</>
              )}
            </p>
          );
        }
        const maxDaily = Math.max(1, ...stats.daily.map((d) => d.n));
        const withPhotoPct = stats.total ? Math.round((stats.with_photo / stats.total) * 100) : 0;
        const withEmailPct = stats.total ? Math.round((stats.with_email / stats.total) * 100) : 0;
        const tile = (label: string, value: string | number, sub?: string) => (
          <div className="border border-white/10 p-4">
            <p className="text-[10px] uppercase tracking-widest text-brand-gray mb-1">{label}</p>
            <p className="font-display text-brand-red text-3xl leading-none">{value}</p>
            {sub && <p className="text-brand-gray/50 text-[10px] mt-1">{sub}</p>}
          </div>
        );
        return (
          <>
            {/* KPI iscrizioni */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {tile("Totale iscritti", stats.total)}
              {tile("Oggi", stats.today)}
              {tile("Ieri", stats.yesterday)}
              {tile("Ultimi 7 giorni", stats.last7)}
            </div>

            {/* Grafico iscritti/giorno */}
            <p className="text-xs uppercase tracking-widest text-brand-gray mb-3">
              Iscritti per giorno — ultimi 14 giorni
            </p>
            <div className="border border-white/10 p-4 mb-8">
              <div className="flex items-end justify-between gap-1 h-32">
                {stats.daily.map((d) => {
                  const dt = new Date(d.d + "T00:00:00");
                  const isToday = d.d === stats.daily[stats.daily.length - 1].d;
                  return (
                    <div key={d.d} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={`${d.d}: ${d.n}`}>
                      <span className={`text-[9px] ${d.n > 0 ? "text-white" : "text-brand-gray/30"}`}>{d.n}</span>
                      <div
                        className={`w-full ${isToday ? "bg-brand-red" : "bg-brand-red/50"}`}
                        style={{ height: `${(d.n / maxDaily) * 100}%`, minHeight: d.n > 0 ? "3px" : "0" }}
                      />
                      <span className="text-[8px] text-brand-gray/50">
                        {dt.toLocaleDateString("it-IT", { day: "numeric" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ingressi + qualità profilo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {tile("Ingressi validati", stats.checked_in, "QR scansionati all'evento")}
              {tile("Con foto", stats.with_photo, `${withPhotoPct}% degli iscritti`)}
              {tile("Con email", stats.with_email, `${withEmailPct}% (rientrano da soli)`)}
              {tile("Da un invito", stats.from_referral, "arrivati via referral")}
            </div>

            {/* Genere */}
            {(stats.male > 0 || stats.female > 0) && (
              <div className="grid grid-cols-2 gap-3 mb-6">
                {tile("Ragazzi", stats.male)}
                {tile("Ragazze", stats.female)}
              </div>
            )}

            {/* Top referrer */}
            {stats.top_referrers.length > 0 && (
              <>
                <p className="text-xs uppercase tracking-widest text-brand-gray mb-3">
                  Chi porta più gente
                </p>
                <div className="border border-white/10 p-4 mb-8 flex flex-col gap-2">
                  {stats.top_referrers.map((r, i) => (
                    <div key={r.alias} className="flex items-center gap-3 text-sm">
                      <span className="text-brand-red font-display w-5">{i + 1}</span>
                      <span className="text-white flex-1 truncate">{r.alias}</span>
                      <span className="text-brand-gray">{r.n} {r.n === 1 ? "invito" : "inviti"}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Nota visite */}
            <div className="border border-white/10 p-4 text-brand-gray/70 text-xs leading-relaxed">
              👀 <span className="text-white">Visite al sito</span> (quante persone aprono unpercento.it,
              da dove arrivano, telefono vs pc): le trovi su{" "}
              <span className="text-brand-gray">vercel.com → progetto 1percent → tab Analytics</span>.
              Non sono qui perché arrivano da un servizio esterno.
            </div>
          </>
        );
      })()}

      {/* Segnalazioni */}
      {tab === "reports" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-widest text-brand-gray">
              Segnalazioni dei membri
            </p>
            <button
              onClick={() => load()}
              className="text-[10px] uppercase tracking-widest text-brand-gray border border-white/10 px-3 py-1.5 hover:border-white/30 transition-all"
            >
              ↻ Aggiorna
            </button>
          </div>
          {reports.length === 0 ? (
            <p className="text-brand-gray/40 text-sm">Nessuna segnalazione. Buon segno.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {reports.map((r) => {
                const isBusy = working === r.id;
                return (
                  <div key={r.id} className={`border p-4 ${r.status === "open" ? "border-yellow-400/40" : "border-white/10 opacity-50"}`}>
                    <div className="flex items-center gap-2 mb-2 text-sm">
                      <span className="text-white font-medium">{r.reported_alias}</span>
                      <span className="text-brand-gray/60 text-xs">#{r.reported_number}</span>
                      <span className="text-brand-gray/60 text-xs ml-auto">
                        da {r.reporter_alias} · {new Date(r.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                    <p className="text-white/85 text-sm mb-3">"{r.reason}"</p>
                    {r.status === "open" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRemovePhoto(r)}
                          disabled={isBusy}
                          className="text-[10px] uppercase tracking-widest border border-brand-red/50 text-brand-red px-3 py-1.5 hover:bg-brand-red hover:text-white transition-all"
                        >
                          Rimuovi foto
                        </button>
                        <button
                          onClick={() => handleCloseReport(r.id)}
                          disabled={isBusy}
                          className="text-[10px] uppercase tracking-widest border border-white/10 text-brand-gray px-3 py-1.5 hover:border-white/30 transition-all"
                        >
                          Chiudi
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Bacheca - post in attesa */}
      {tab === "posts" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-widest text-brand-gray">
              Post in attesa di approvazione
            </p>
            <button
              onClick={() => load()}
              className="text-[10px] uppercase tracking-widest text-brand-gray border border-white/10 px-3 py-1.5 hover:border-white/30 transition-all"
            >
              ↻ Aggiorna
            </button>
          </div>
          {posts.length === 0 ? (
            <p className="text-brand-gray/40 text-sm">Nessun messaggio in attesa.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {posts.map((post) => {
                const avatar = getAvatar(post.avatar_id);
                const isBusy = working === post.id;
                return (
                  <div key={post.id} className="border border-white/10 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span>{avatar.emoji}</span>
                      <span className="text-white text-sm font-medium">{post.alias}</span>
                    </div>
                    <p
                      className="text-yellow-200 text-base mb-3 leading-snug"
                      style={{ fontFamily: "var(--font-caveat)" }}
                    >
                      "{post.text}"
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprovePost(post.id)}
                        disabled={isBusy}
                        className="text-[10px] uppercase tracking-widest text-green-400 border border-green-400/30 px-3 py-1.5 hover:bg-green-400/10 transition-all disabled:opacity-40"
                      >
                        {isBusy ? "…" : "✓ Approva"}
                      </button>
                      <button
                        onClick={() => handleRejectPost(post.id)}
                        disabled={isBusy}
                        className="text-[10px] uppercase tracking-widest text-brand-red border border-brand-red/30 px-3 py-1.5 hover:bg-brand-red/10 transition-all disabled:opacity-40"
                      >
                        {isBusy ? "…" : "✕ Elimina"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Post già online sulla bacheca */}
          <p className="text-xs uppercase tracking-widest text-brand-gray mt-10 mb-4">
            Post online sulla bacheca ({approvedPosts.length})
          </p>
          {approvedPosts.length === 0 ? (
            <p className="text-brand-gray/40 text-sm">Nessun post online.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {approvedPosts.map((post) => {
                const avatar = getAvatar(post.avatar_id);
                const isBusy = working === post.id;
                return (
                  <div key={post.id} className="border border-white/8 p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span>{avatar.emoji}</span>
                        <span className="text-white text-sm font-medium">{post.alias}</span>
                      </div>
                      <p
                        className="text-yellow-200 text-base leading-snug break-words"
                        style={{ fontFamily: "var(--font-caveat)" }}
                      >
                        "{post.text}"
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveApproved(post.id)}
                      disabled={isBusy}
                      className="flex-shrink-0 text-[10px] uppercase tracking-widest text-brand-red border border-brand-red/30 px-3 py-1.5 hover:bg-brand-red/10 transition-all disabled:opacity-40"
                    >
                      {isBusy ? "…" : "✕ Rimuovi"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Risposte al quiz */}
      {tab === "answers" && (() => {
        const written = answerMembers.filter((m) => hasFreeText(m.quiz_answers));
        const shown = onlyWritten ? written : answerMembers;

        // Distribuzione archetipi (per il marketing)
        const archCounts: Record<string, number> = {};
        for (const m of answerMembers) {
          const a = m.quiz_answers?.archetype;
          if (a) archCounts[a] = (archCounts[a] ?? 0) + 1;
        }
        const archSorted = Object.entries(archCounts).sort((x, y) => y[1] - x[1]);

        return (
          <>
            {/* Riepilogo */}
            <div className="border border-white/10 p-4 mb-6">
              <p className="text-sm text-white mb-1">
                <span className="text-brand-red font-display text-xl">{written.length}</span>
                {" "}membri su {answerMembers.length} hanno <span className="text-white">scritto qualcosa</span> nelle domande aperte.
              </p>
              {archSorted.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {archSorted.map(([arch, n]) => (
                    <span key={arch} className="text-[10px] uppercase tracking-widest border border-white/15 px-2 py-1 text-brand-gray">
                      {arch} · <span className="text-white">{n}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Filtro */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs uppercase tracking-widest text-brand-gray">
                {onlyWritten ? "Solo chi ha scritto" : "Tutte le risposte"} — dal più recente
              </p>
              <button
                onClick={() => setOnlyWritten((v) => !v)}
                className={`text-[10px] uppercase tracking-widest px-3 py-1.5 border transition-all ${onlyWritten ? "border-brand-red text-brand-red bg-brand-red/10" : "border-white/10 text-brand-gray hover:border-white/30"}`}
              >
                {onlyWritten ? "✓ Solo scritte" : "Solo scritte"}
              </button>
            </div>

            {loading ? (
              <p className="text-brand-gray text-sm animate-pulse-glow">Caricamento…</p>
            ) : answerMembers.length === 0 ? (
              <p className="text-brand-gray/40 text-sm">
                Nessuna risposta. Se è la prima volta, esegui lo script
                {" "}<span className="text-brand-gray">supabase/admin_quiz_answers.sql</span>{" "}
                nel SQL Editor di Supabase.
              </p>
            ) : shown.length === 0 ? (
              <p className="text-brand-gray/40 text-sm">Nessuno ha ancora scritto testo libero.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {shown.map((m) => {
                  const a = m.quiz_answers ?? {};
                  const avatar = m.avatar_id ? getAvatar(m.avatar_id) : null;
                  const date = new Date(m.created_at).toLocaleDateString("it-IT", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  });
                  return (
                    <div key={m.id} className="border border-white/8 p-4">
                      {/* Header membro */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">{avatar?.emoji ?? "?"}</span>
                        <span className="text-white text-sm font-medium">{m.alias}</span>
                        {a.archetype && (
                          <span className="text-[9px] uppercase tracking-widest text-brand-red border border-brand-red/40 px-1.5 py-0.5">
                            {a.archetype}
                          </span>
                        )}
                        <span className="text-brand-gray/40 text-[10px] ml-auto">
                          #{String(m.member_number).padStart(4, "0")} · {date}
                        </span>
                      </div>

                      {/* Domande a scelta */}
                      <div className="flex flex-col gap-2">
                        {(["q1", "q2"] as const).map((qId) => {
                          const scritto = freeText(a[qId]);
                          const scelta = optionId(a[qId]);
                          return (
                            <div key={qId}>
                              <p className="text-brand-gray/60 text-[11px]">{questionText(qId)}</p>
                              <p className="text-white/90 text-sm">
                                {scelta ? choiceLabel(qId, scelta) : "— ha scritto la sua"}
                                {scritto && (
                                  <span
                                    className="block text-yellow-200 mt-0.5"
                                    style={{ fontFamily: "var(--font-caveat)", fontSize: "1.05rem" }}
                                  >
                                    “{scritto}”
                                  </span>
                                )}
                              </p>
                            </div>
                          );
                        })}

                        {/* Domande aperte */}
                        {(["q3", "q4"] as const).map((qId) => {
                          const ans = a[qId];
                          return (
                            <div key={qId}>
                              <p className="text-brand-gray/60 text-[11px]">{questionText(qId)}</p>
                              <p className="text-white/90 text-sm">
                                <span className="text-brand-red">{ans?.tag ?? "—"}</span>
                                {ans?.text?.trim() && (
                                  <span
                                    className="block text-yellow-200 mt-0.5"
                                    style={{ fontFamily: "var(--font-caveat)", fontSize: "1.05rem" }}
                                  >
                                    “{ans.text.trim()}”
                                  </span>
                                )}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        );
      })()}

      {/* Lista membri */}
      {tab === "members" && (() => {
      // Il ruolo arriva solo dopo aver incollato 08_chi_e_chi.sql
      const datiRuolo = members.some((m) => typeof m.role === "string");
      return <>
      <p className="text-xs uppercase tracking-widest text-brand-gray mb-3">
        Tutti i membri — dal più recente
      </p>

      {/* Se il ruolo non arriva dal database, NON si indovina: dire
          "cliente" a uno staff approvato è peggio che non dire niente. */}
      {!datiRuolo && members.length > 0 && (
        <div className="border border-amber-300/40 bg-amber-300/5 px-4 py-3 mb-4">
          <p className="text-amber-300 text-[10px] uppercase tracking-widest">
            manca uno script
          </p>
          <p className="text-brand-gray text-xs leading-relaxed mt-1.5">
            Il database non manda ancora il ruolo, quindi qui non si può sapere chi è
            staff e chi cliente. Incolla{" "}
            <span className="text-white font-mono">supabase/08_chi_e_chi.sql</span> nel
            SQL Editor di Supabase e ricarica.
          </p>
        </div>
      )}

      {/* Chi è entrato come cosa. I numeri sono cliccabili: filtrano. */}
      {datiRuolo && (
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTRI.map((f) => {
          const quanti =
            f.id === "tutti" ? members.length : members.filter((m) => tipoDi(m) === f.id).length;
          const attivo = filtro === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`border px-3 py-1.5 text-[10px] uppercase tracking-widest transition-all ${
                attivo
                  ? "border-brand-red bg-brand-red/15 text-white"
                  : "border-white/10 text-brand-gray hover:border-white/30"
              }`}
            >
              {f.testo} <span className="tabular-nums text-white/80">{quanti}</span>
            </button>
          );
        })}
      </div>
      )}

      {loading ? (
        <p className="text-brand-gray text-sm animate-pulse-glow">Caricamento…</p>
      ) : members.length === 0 ? (
        <p className="text-brand-gray/40 text-sm">Nessun membro ancora.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {members
            .filter((m) => filtro === "tutti" || tipoDi(m) === filtro)
            .map((m) => {
            const avatar = m.avatar_id ? getAvatar(m.avatar_id) : null;
            const etichetta = datiRuolo ? ETICHETTE[tipoDi(m)] : null;
            const date = new Date(m.created_at).toLocaleDateString("it-IT", {
              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
            });
            const isEditing = editingId === m.id;
            const isBusy = working === m.id;

            return (
              <div
                key={m.id}
                className="border border-white/8 p-3 flex items-center gap-3"
              >
                {/* Avatar */}
                <span className="text-xl w-8 text-center flex-shrink-0">
                  {avatar?.emoji ?? "?"}
                </span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <input
                      type="text"
                      value={editAlias}
                      onChange={(e) => setEditAlias(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveAlias(m.id)}
                      className="bg-transparent border-b border-brand-red text-white text-sm outline-none w-full"
                      autoFocus
                    />
                  ) : (
                    <p className="text-white text-sm font-medium truncate flex items-center gap-2">
                      <span className="truncate">{m.alias}</span>
                      {etichetta && (
                        <span
                          className={`flex-shrink-0 border px-1.5 py-0.5 text-[9px] uppercase tracking-widest ${etichetta.classe}`}
                        >
                          {etichetta.testo}
                        </span>
                      )}
                    </p>
                  )}
                  <p className="text-brand-gray/50 text-[10px]">
                    #{String(m.member_number).padStart(4, "0")} · {date}
                    {m.email && <> · {m.email}</>}
                  </p>
                  {(m.nome || m.invitato_da) && (
                    <p className="text-brand-gray/40 text-[10px]">
                      {m.nome && <>{m.nome}</>}
                      {m.nome && m.invitato_da && <> · </>}
                      {m.invitato_da && <>portato da {m.invitato_da}</>}
                    </p>
                  )}
                </div>

                {/* Azioni */}
                <div className="flex gap-2 flex-shrink-0">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => handleSaveAlias(m.id)}
                        disabled={isBusy}
                        className="text-[10px] uppercase tracking-widest text-green-400 border border-green-400/30 px-2 py-1 hover:bg-green-400/10 transition-all"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-[10px] text-brand-gray border border-white/10 px-2 py-1"
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingId(m.id); setEditAlias(m.alias); }}
                        className="text-[10px] uppercase tracking-widest text-brand-gray border border-white/10 px-2 py-1 hover:border-white/30 transition-all"
                        title="Modifica alias"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(m.id, m.alias)}
                        disabled={isBusy}
                        className="text-[10px] uppercase tracking-widest text-brand-red border border-brand-red/30 px-2 py-1 hover:bg-brand-red/10 transition-all disabled:opacity-40"
                        title="Elimina membro"
                      >
                        {isBusy ? "…" : "Del"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>;
      })()}
    </main>
  );
}
