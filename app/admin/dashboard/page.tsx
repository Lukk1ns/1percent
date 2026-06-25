"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getAvatar } from "@/lib/avatars";

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
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"members" | "posts">("members");
  const [members, setMembers] = useState<Member[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [approvedPosts, setApprovedPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAlias, setEditAlias] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  async function load() {
    const supabase = createClient();
    const [membersRes, postsRes, approvedRes] = await Promise.all([
      supabase.rpc("admin_members"),
      supabase.rpc("admin_pending_posts"),
      supabase.rpc("approved_posts"),
    ]);
    if (membersRes.error) setError("Errore membri: " + membersRes.error.message);
    if (membersRes.data) setMembers(membersRes.data as Member[]);
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
      setUserEmail(user.email);
      const { data: adminCheck } = await supabase.rpc("is_admin");
      setIsAdmin(adminCheck as boolean);
      load();
      // Aggiorna automaticamente ogni 10s così i nuovi post-it compaiono da soli
      interval = setInterval(load, 10000);
    })();
    return () => { if (interval) clearInterval(interval); };
  }, [router]);

  async function handleDelete(id: string, alias: string) {
    if (!confirm(`Elimina "${alias}"? Il pass verrà revocato.`)) return;
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

  const checkedIn = members.filter((_, i) => i < 0).length; // placeholder, aggiungiamo dopo

  return (
    <main className="flex-1 flex flex-col px-4 py-8 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-brand-red text-3xl">Admin</h1>
          <p className="text-brand-gray text-xs uppercase tracking-widest">Dashboard 1%</p>
          {userEmail && (
            <p className="text-[10px] mt-1 font-mono break-all">
              <span className="text-brand-gray/60">{userEmail}</span>{" "}
              <span className={isAdmin ? "text-green-400" : "text-brand-red"}>
                {isAdmin ? "· staff ✓" : "· NON staff ✗"}
              </span>
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/admin/scan")}
            className="text-xs uppercase tracking-widest text-brand-red border border-brand-red px-3 py-2 hover:bg-brand-red hover:text-white transition-all"
          >
            Scanner QR
          </button>
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

      {/* Tab */}
      <div className="flex gap-0 mb-8 border border-white/10">
        <button
          onClick={() => setTab("members")}
          className={`flex-1 py-3 text-xs uppercase tracking-widest transition-all ${tab === "members" ? "bg-brand-red text-white" : "text-brand-gray hover:text-white"}`}
        >
          Membri
        </button>
        <button
          onClick={() => setTab("posts")}
          className={`flex-1 py-3 text-xs uppercase tracking-widest transition-all relative ${tab === "posts" ? "bg-brand-red text-white" : "text-brand-gray hover:text-white"}`}
        >
          Bacheca
          {posts.length > 0 && (
            <span className="absolute top-1 right-3 bg-yellow-400 text-black text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {posts.length}
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

      {/* Lista membri */}
      {tab === "members" && <>
      <p className="text-xs uppercase tracking-widest text-brand-gray mb-4">
        Tutti i membri — dal più recente
      </p>

      {loading ? (
        <p className="text-brand-gray text-sm animate-pulse-glow">Caricamento…</p>
      ) : members.length === 0 ? (
        <p className="text-brand-gray/40 text-sm">Nessun membro ancora.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {members.map((m) => {
            const avatar = m.avatar_id ? getAvatar(m.avatar_id) : null;
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
                    <p className="text-white text-sm font-medium truncate">{m.alias}</p>
                  )}
                  <p className="text-brand-gray/50 text-[10px]">
                    #{String(m.member_number).padStart(4, "0")} · {date}
                    {m.email && <> · {m.email}</>}
                  </p>
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
      </>}
    </main>
  );
}
