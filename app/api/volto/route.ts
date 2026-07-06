import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { VOLTO_SIZE, BLUR_SIGMA, voltoPath } from "@/lib/volto";

// Upload del Volto. Tutto il lavoro sporco avviene QUI, sul server:
// - EXIF strippati (le foto da telefono contengono anche il GPS)
// - crop quadrato 512px
// - versione sfocata generata con sharp → bucket pubblico
// - versione nitida → bucket privato (mai inviata agli altri)
// Il client non vede mai i byte nitidi di nessun altro: il blur
// non è un filtro CSS rimovibile.

export const runtime = "nodejs";

const MAX_BYTES = 6 * 1024 * 1024;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "no-session" }, { status: 401 });
  }

  let file: FormDataEntryValue | null;
  try {
    const form = await req.formData();
    file = form.get("file");
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no-file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too-big" }, { status: 413 });
  }

  const input = Buffer.from(await file.arrayBuffer());

  let clear: Buffer;
  let blurred: Buffer;
  try {
    // .rotate() applica l'orientamento EXIF; i metadati (GPS incluso)
    // NON vengono copiati nell'output (niente .withMetadata()).
    const base = sharp(input)
      .rotate()
      .resize(VOLTO_SIZE, VOLTO_SIZE, { fit: "cover", position: "attention" });
    clear = await base.clone().webp({ quality: 82 }).toBuffer();
    blurred = await base
      .clone()
      .modulate({ saturation: 0.88 })
      .blur(BLUR_SIGMA)
      .webp({ quality: 74 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "not-image" }, { status: 415 });
  }

  // Upload con la sessione dell'utente: le policy storage permettono
  // di scrivere SOLO nella propria cartella <uuid>/.
  const path = voltoPath(user.id);
  const [up1, up2] = await Promise.all([
    supabase.storage
      .from("volti")
      .upload(path, clear, { contentType: "image/webp", upsert: true }),
    supabase.storage
      .from("volti-blur")
      .upload(path, blurred, { contentType: "image/webp", upsert: true }),
  ]);
  if (up1.error || up2.error) {
    return NextResponse.json({ error: "upload-failed" }, { status: 500 });
  }

  const { data: updatedAt, error } = await supabase.rpc("set_my_photo");
  if (error) {
    return NextResponse.json({ error: "profile-update-failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updatedAt });
}

// Rimozione: la RPC cancella file (entrambi i bucket) e colonne.
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "no-session" }, { status: 401 });
  }

  const { error } = await supabase.rpc("clear_my_photo");
  if (error) {
    return NextResponse.json({ error: "delete-failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
