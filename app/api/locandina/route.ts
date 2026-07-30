import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import {
  BUCKET_NITIDA,
  BUCKET_SFOCATA,
  LOCANDINA_BLUR_SIGMA,
  LOCANDINA_BLUR_W,
  LOCANDINA_H,
  LOCANDINA_W,
  locandinaPath,
} from "@/lib/locandina";

// Caricamento della locandina di un evento. Solo staff.
//
// Il lavoro lo fa il server:
//   · EXIF strippati (le grafiche esportate dal telefono se li portano dietro)
//   · rientra in 1080x1920 senza tagliare niente e senza stirare
//   · versione sfocata generata a 180px → deposito pubblico
//   · versione nitida → deposito privato, la leggono solo i membri
//
// I file si caricano come Blob, mai come Buffer: sul runtime di Vercel
// un Buffer viene letto come testo e l'immagine arriva corrotta.

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

  let nitida: Buffer;
  let sfocata: Buffer;
  try {
    const base = sharp(input).rotate();
    nitida = await base
      .clone()
      // "inside" = ci sta dentro intera, niente tagli e niente deformazioni
      .resize(LOCANDINA_W, LOCANDINA_H, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer();
    sfocata = await base
      .clone()
      .resize(LOCANDINA_BLUR_W, null, { fit: "inside" })
      .modulate({ saturation: 0.9 })
      .blur(LOCANDINA_BLUR_SIGMA)
      .webp({ quality: 62 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "non-e-un-immagine" }, { status: 415 });
  }

  const path = locandinaPath(eventId);
  const opzioni = { contentType: "image/webp", upsert: true };
  const [up1, up2] = await Promise.all([
    supabase.storage
      .from(BUCKET_NITIDA)
      .upload(path, new Blob([new Uint8Array(nitida)], { type: "image/webp" }), opzioni),
    supabase.storage
      .from(BUCKET_SFOCATA)
      .upload(path, new Blob([new Uint8Array(sfocata)], { type: "image/webp" }), opzioni),
  ]);
  if (up1.error || up2.error) {
    return NextResponse.json(
      { error: "caricamento-fallito", detail: up1.error?.message ?? up2.error?.message },
      { status: 500 },
    );
  }

  const { data: v, error } = await supabase.rpc("admin_set_event_cover", {
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

  // I file via Storage API: Supabase vieta il delete SQL su storage.objects
  const path = locandinaPath(eventId);
  await Promise.all([
    supabase.storage.from(BUCKET_NITIDA).remove([path]),
    supabase.storage.from(BUCKET_SFOCATA).remove([path]),
  ]);

  const { error } = await supabase.rpc("admin_set_event_cover", {
    p_id: eventId,
    p_key: null,
  });
  if (error) {
    return NextResponse.json({ error: "rimozione-fallita", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
