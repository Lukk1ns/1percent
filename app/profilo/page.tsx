"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { voltoPath } from "@/lib/volto";
import Volto from "@/components/Volto";

type Profile = {
  id: string;
  member_number: number;
  alias: string;
  avatar_id: string | null;
  bio: string | null;
  photo_blur_path: string | null;
  photo_updated_at: string | null;
};

export default function ProfiloPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clearUrl, setClearUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Flusso upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [blurPreview, setBlurPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [consentFace, setConsentFace] = useState(false);
  const [consentAge, setConsentAge] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Bio
  const [bio, setBio] = useState("");
  const [bioSaved, setBioSaved] = useState(false);
  const [bioSaving, setBioSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/unisciti");
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id,member_number,alias,avatar_id,bio,photo_blur_path,photo_updated_at")
      .eq("id", user.id)
      .single();
    if (!data) {
      router.replace("/unisciti");
      return;
    }
    setProfile(data as Profile);
    setBio((data as Profile).bio ?? "");

    if ((data as Profile).photo_blur_path) {
      const { data: signed } = await supabase.storage
        .from("volti")
        .createSignedUrl(voltoPath(user.id), 3600);
      setClearUrl(signed?.signedUrl ?? null);
    } else {
      setClearUrl(null);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  function resetUploadFlow() {
    setPendingFile(null);
    setBlurPreview(null);
    setConsentFace(false);
    setConsentAge(false);
    setErrorMsg(null);
    if (localUrl) URL.revokeObjectURL(localUrl);
    setLocalUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFileChosen(f: File) {
    setErrorMsg(null);
    if (f.size > 6 * 1024 * 1024) {
      setErrorMsg("Foto troppo pesante (max 6 MB).");
      return;
    }
    setPendingFile(f);
    setLocalUrl(URL.createObjectURL(f));
    setPreviewLoading(true);
    setBlurPreview(null);

    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch("/api/volto/preview", { method: "POST", body: fd });
    setPreviewLoading(false);
    if (!res.ok) {
      setErrorMsg("Questa foto non va. Prova con un'altra.");
      setPendingFile(null);
      return;
    }
    const json = await res.json();
    setBlurPreview(json.previews?.[0]?.dataUrl ?? null);
  }

  async function handleConfirmUpload() {
    if (!pendingFile || !consentFace || !consentAge) return;
    setUploading(true);
    setErrorMsg(null);
    const fd = new FormData();
    fd.append("file", pendingFile);
    const res = await fetch("/api/volto", { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) {
      setErrorMsg("Upload fallito. Riprova.");
      return;
    }
    resetUploadFlow();
    setLoading(true);
    await loadProfile();
  }

  async function handleRemovePhoto() {
    if (!window.confirm("Rimuovere il tuo volto? Tornerai al simbolo.")) return;
    const res = await fetch("/api/volto", { method: "DELETE" });
    if (res.ok) {
      setLoading(true);
      await loadProfile();
    }
  }

  async function handleSaveBio() {
    setBioSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("update_my_bio", { p_bio: bio });
    setBioSaving(false);
    if (!error) {
      setBioSaved(true);
      setTimeout(() => setBioSaved(false), 2000);
    }
  }

  if (loading || !profile) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="font-display text-brand-red text-6xl animate-pulse-glow">1%</div>
      </main>
    );
  }

  const hasPhoto = !!profile.photo_blur_path;

  return (
    <main className="flex-1 flex flex-col items-center px-4 py-10 w-full max-w-md mx-auto">
      <p className="text-xs uppercase tracking-[0.3em] text-brand-gray mb-2">il tuo profilo</p>
      <h1 className="font-display text-brand-red text-5xl mb-8">1%</h1>

      {/* ---- Il Volto ---- */}
      <section className="w-full flex flex-col items-center mb-10">
        {!pendingFile && (
          <>
            <Volto
              photoBlurPath={profile.photo_blur_path}
              photoUpdatedAt={profile.photo_updated_at}
              avatarId={profile.avatar_id}
              clearUrl={clearUrl}
              size={140}
              alt={profile.alias}
              className={hasPhoto ? "border border-brand-red/40" : ""}
            />
            <p className="text-white font-mono text-lg mt-3">{profile.alias}</p>
            <p className="text-brand-gray/60 text-xs font-mono">#{profile.member_number}</p>

            {hasPhoto ? (
              <>
                <p className="text-brand-gray/60 text-[11px] text-center mt-3 max-w-xs">
                  Tu ti vedi nitido. Gli altri ti vedono sfocato — finché non li conosci davvero.
                </p>
                <div className="flex gap-3 mt-4">
                  <button onClick={() => fileRef.current?.click()} className="btn btn-outline text-xs">
                    Cambia foto
                  </button>
                  <button
                    onClick={handleRemovePhoto}
                    className="text-[10px] uppercase tracking-widest text-brand-gray/50 hover:text-brand-red transition-colors"
                  >
                    rimuovi
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-brand-gray text-sm text-center mt-4 max-w-xs">
                  Carica il tuo volto. <span className="text-white">Sfocato il giusto</span>: si intravede, non si capisce.
                </p>
                <p className="text-brand-gray/60 text-[11px] text-center mt-1 max-w-xs">
                  Nessuno vedrà mai la foto nitida. Nessuno.
                </p>
                <button onClick={() => fileRef.current?.click()} className="btn btn-primary mt-4">
                  Carica il tuo volto
                </button>
              </>
            )}
          </>
        )}

        {/* Anteprima prima della conferma */}
        {pendingFile && (
          <div className="w-full flex flex-col items-center animate-fade-up">
            <div className="flex items-end justify-center gap-6">
              <div className="flex flex-col items-center">
                {localUrl && (
                  <Volto clearUrl={localUrl} size={110} alt="tu" />
                )}
                <p className="text-[10px] uppercase tracking-widest text-brand-gray/60 mt-2">come ti vedi tu</p>
              </div>
              <div className="flex flex-col items-center">
                {previewLoading ? (
                  <div
                    className="flex items-center justify-center border border-white/10"
                    style={{ width: 110, height: 110 }}
                  >
                    <span className="font-display text-brand-red text-xl animate-pulse-glow">1%</span>
                  </div>
                ) : (
                  blurPreview && <Volto blurSrc={blurPreview} size={110} alt="sfocato" />
                )}
                <p className="text-[10px] uppercase tracking-widest text-brand-red/80 mt-2">come ti vedranno</p>
              </div>
            </div>

            <label className="flex items-start gap-2 mt-6 max-w-xs cursor-pointer">
              <input
                type="checkbox"
                checked={consentFace}
                onChange={(e) => setConsentFace(e.target.checked)}
                className="mt-0.5 accent-[#E0181F]"
              />
              <span className="text-[11px] text-brand-gray leading-snug">
                È il mio volto. Acconsento a mostrarlo <span className="text-white">sfocato</span> agli altri membri.
              </span>
            </label>
            <label className="flex items-start gap-2 mt-2 max-w-xs cursor-pointer">
              <input
                type="checkbox"
                checked={consentAge}
                onChange={(e) => setConsentAge(e.target.checked)}
                className="mt-0.5 accent-[#E0181F]"
              />
              <span className="text-[11px] text-brand-gray leading-snug">Ho almeno 16 anni.</span>
            </label>

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleConfirmUpload}
                disabled={!consentFace || !consentAge || uploading || previewLoading}
                className={`btn ${consentFace && consentAge && !previewLoading ? "btn-primary" : "btn-outline opacity-40 cursor-not-allowed"}`}
              >
                {uploading ? "..." : "Conferma"}
              </button>
              <button onClick={resetUploadFlow} className="btn btn-ghost text-xs">
                Annulla
              </button>
            </div>
          </div>
        )}

        {errorMsg && <p className="text-brand-red text-xs mt-3">{errorMsg}</p>}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileChosen(f);
          }}
        />
      </section>

      {/* ---- Bio ---- */}
      <section className="w-full mb-10">
        <p className="text-[10px] uppercase tracking-[0.3em] text-brand-gray/60 mb-2">
          una riga su di te — non un tema
        </p>
        <input
          type="text"
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 120))}
          placeholder="es. ci sono sempre, non mi vedi mai"
          className="input-line text-sm"
          maxLength={120}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-brand-gray/40 font-mono">{bio.length}/120</span>
          <button
            onClick={handleSaveBio}
            disabled={bioSaving || bio === (profile.bio ?? "")}
            className={`text-[10px] uppercase tracking-widest transition-colors ${
              bio === (profile.bio ?? "")
                ? "text-brand-gray/30 cursor-default"
                : "text-brand-red hover:text-white"
            }`}
          >
            {bioSaving ? "..." : bioSaved ? "✓ salvata" : "salva"}
          </button>
        </div>
      </section>

      {/* ---- Link al profilo pubblico ---- */}
      <button
        onClick={() => router.push(`/u/${encodeURIComponent(profile.alias)}`)}
        className="btn btn-outline w-full"
      >
        Guarda come ti vedono gli altri →
      </button>

      {/* Nav bottom */}
      <nav className="w-full mt-10 pt-6 border-t border-white/5 flex justify-around text-[10px] uppercase tracking-widest text-brand-gray/50">
        <button onClick={() => router.push("/")} className="hover:text-brand-gray transition-colors">Home</button>
        <button onClick={() => router.push("/card")} className="hover:text-brand-gray transition-colors">Card</button>
        <button onClick={() => router.push("/membri")} className="hover:text-brand-gray transition-colors">Muro</button>
        <button onClick={() => router.push("/profilo")} className="text-brand-red">Profilo</button>
        <button onClick={() => router.push("/invita")} className="hover:text-brand-gray transition-colors">Invita</button>
      </nav>
    </main>
  );
}
