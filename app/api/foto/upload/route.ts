import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { caricaSuR2, chiaviFoto, r2Configurato } from "@/lib/r2";

// Caricamento di una foto in un album. Solo staff.
//
// Dal file originale il server ricava tre versioni:
//   · miniatura 500px  → la griglia (leggera: 500 foto sono pochi MB)
//   · media 1400px     → quella che si guarda a schermo intero
//   · alta 2400px      → quella che si scarica
//
// Gli EXIF vengono buttati: dentro ci sono il modello della macchina e,
// spesso, il posto esatto in cui è stata scattata.

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  if (!r2Configurato()) {
    return NextResponse.json({ error: "r2-non-configurato" }, { status: 503 });
  }

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

  let file: FormDataEntryValue | null;
  let albumId: string;
  try {
    const form = await req.formData();
    file = form.get("file");
    albumId = String(form.get("album_id") ?? "");
  } catch {
    return NextResponse.json({ error: "richiesta-illeggibile" }, { status: 400 });
  }

  if (!albumId) {
    return NextResponse.json({ error: "manca-album" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "manca-file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "troppo-grande" }, { status: 413 });
  }

  const input = Buffer.from(await file.arrayBuffer());

  let thumb: Buffer;
  let medium: Buffer;
  let hd: Buffer;
  let larghezza = 0;
  let altezza = 0;

  try {
    const base = sharp(input).rotate();
    const meta = await base.metadata();
    // dopo rotate() le misure sono quelle giuste per il verso reale
    const ruotata = meta.orientation && meta.orientation >= 5;
    larghezza = (ruotata ? meta.height : meta.width) ?? 0;
    altezza = (ruotata ? meta.width : meta.height) ?? 0;

    [thumb, medium, hd] = await Promise.all([
      base.clone().resize(500, null, { fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toBuffer(),
      base.clone().resize(1400, null, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
      base.clone().resize(2400, null, { fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer(),
    ]);
  } catch {
    return NextResponse.json({ error: "non-e-un-immagine" }, { status: 415 });
  }

  const id = crypto.randomUUID();
  const chiavi = chiaviFoto(albumId, id);

  try {
    await Promise.all([
      caricaSuR2(chiavi.thumb, thumb, "image/webp"),
      caricaSuR2(chiavi.medium, medium, "image/webp"),
      caricaSuR2(chiavi.hd, hd, "image/webp"),
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: "r2-fallito", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  const { data, error } = await supabase.rpc("admin_foto_aggiungi", {
    p_album: albumId,
    p_thumb: chiavi.thumb,
    p_medium: chiavi.medium,
    p_hd: chiavi.hd,
    p_w: larghezza,
    p_h: altezza,
  });

  if (error) {
    return NextResponse.json(
      { error: "registrazione-fallita", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: data });
}
