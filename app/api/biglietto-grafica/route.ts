import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import {
  BIGLIETTO_H,
  BIGLIETTO_W,
  BUCKET_BIGLIETTI,
  graficaBigliettoPath,
} from "@/lib/biglietto";

// La grafica che il cliente vede sul suo biglietto. Solo staff.
//
// Come per le locandine: EXIF via, rientra in 1080x1920 senza tagliare
// niente, e i file si caricano come Blob (su Vercel un Buffer viene
// letto come testo e l'immagine arriva rovinata).

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;

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

  let file: FormDataEntryValue | null;
  let eventId: string;
  try {
    const form = await req.formData();
    file = form.get("file");
    eventId = String(form.get("event_id") ?? "");
  } catch {
    return NextResponse.json({ error: "richiesta-illeggibile" }, { status: 400 });
  }

  if (!eventId) {
    return NextResponse.json({ error: "manca-evento" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "manca-file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "troppo-grande" }, { status: 413 });
  }

  const input = Buffer.from(await file.arrayBuffer());

  let grafica: Buffer;
  try {
    grafica = await sharp(input)
      .rotate()
      .resize(BIGLIETTO_W, BIGLIETTO_H, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "non-e-un-immagine" }, { status: 415 });
  }

  const path = graficaBigliettoPath(eventId);
  const { error: upErr } = await supabase.storage
    .from(BUCKET_BIGLIETTI)
    .upload(path, new Blob([new Uint8Array(grafica)], { type: "image/webp" }), {
      contentType: "image/webp",
      upsert: true,
    });

  if (upErr) {
    return NextResponse.json(
      { error: "caricamento-fallito", detail: upErr.message },
      { status: 500 },
    );
  }

  const { data: v, error } = await supabase.rpc("admin_set_event_ticket", {
    p_id: eventId,
    p_key: path,
  });
  if (error) {
    return NextResponse.json(
      { error: "registrazione-fallita", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, key: path, v });
}

export async function DELETE(req: Request) {
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

  let eventId = "";
  try {
    const body = await req.json();
    eventId = String(body?.event_id ?? "");
  } catch {
    return NextResponse.json({ error: "richiesta-illeggibile" }, { status: 400 });
  }
  if (!eventId) {
    return NextResponse.json({ error: "manca-evento" }, { status: 400 });
  }

  await supabase.storage.from(BUCKET_BIGLIETTI).remove([graficaBigliettoPath(eventId)]);

  const { error } = await supabase.rpc("admin_set_event_ticket", {
    p_id: eventId,
    p_key: "",
  });
  if (error) {
    return NextResponse.json({ error: "registrazione-fallita" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
