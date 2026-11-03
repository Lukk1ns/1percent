import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cancellaCartellaR2, r2Configurato } from "@/lib/r2";

// Svuotare o eliminare un album in un colpo solo (script 55). Solo admin.
//
// Prima il database (admin_album_svuota controlla di nuovo che sia admin),
// poi i file su R2: se R2 non risponde, le foto sono già sparite dal sito
// e restano solo file orfani, che non vede nessuno.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "no-session" }, { status: 401 });
  }

  const { data: admin } = await supabase.rpc("is_admin");
  if (!admin) {
    return NextResponse.json({ error: "non-autorizzato" }, { status: 403 });
  }

  let albumId = "";
  let elimina = false;
  try {
    const corpo = await req.json();
    albumId = String(corpo.album_id ?? "");
    elimina = corpo.elimina === true;
  } catch {
    return NextResponse.json({ error: "richiesta-illeggibile" }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/.test(albumId)) {
    return NextResponse.json({ error: "manca-album" }, { status: 400 });
  }

  const { data: foto, error } = await supabase.rpc("admin_album_svuota", {
    p_id: albumId,
    p_elimina: elimina,
  });
  if (error) {
    const manca = error.code === "PGRST202" || error.message.includes("admin_album_svuota");
    return NextResponse.json(
      { error: manca ? "manca-script-55" : error.message },
      { status: manca ? 501 : 500 },
    );
  }
  if (foto === -1) {
    return NextResponse.json({ error: "album-sparito" }, { status: 404 });
  }

  let file = 0;
  let r2 = "ok";
  if (r2Configurato()) {
    try {
      file = await cancellaCartellaR2(albumId);
    } catch {
      r2 = "non-risponde";
    }
  }

  return NextResponse.json({ ok: true, foto, file, r2 });
}
