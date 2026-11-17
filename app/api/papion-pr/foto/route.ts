import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { caricaSuR2, cancellaSuR2, r2Configurato, urlFirmato } from "@/lib/r2";
import { LINK_PAPION } from "@/lib/papion-pr";

/**
 * La foto di un PR del PAPI-ON (script 61).
 *
 * POST: la carica il PR dalla sua app (campo `link`) o Luka dal pannello
 * (campo `pr`, serve l'accesso admin). Il server la ritaglia quadrata a
 * 512 px, butta gli EXIF (dentro c'è anche il posto dello scatto) e la
 * mette su R2 in `papion-pr/<id>/<caso>.webp`. Il database controlla che
 * la chiave sia proprio di quel PR.
 *
 * GET ?k=<chiave>: R2 è privato, quindi si rimanda a un indirizzo firmato.
 * La chiave ha un pezzo a caso: chi non l'ha ricevuta dal sito non la indovina.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const CHIAVE = /^papion-pr\/[0-9a-f-]{36}\/[0-9a-f]{12}\.webp$/;
const MAX_BYTES = 8 * 1024 * 1024;

export async function GET(req: Request) {
  const k = new URL(req.url).searchParams.get("k") ?? "";
  if (!CHIAVE.test(k) || !r2Configurato()) {
    return new NextResponse("Non trovata", { status: 404 });
  }
  const url = await urlFirmato(k);
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=600" },
  });
}

export async function POST(req: Request) {
  if (!r2Configurato()) {
    return NextResponse.json({ error: "r2-non-configurato" }, { status: 503 });
  }

  let file: FormDataEntryValue | null;
  let link: string;
  let prId: string;
  try {
    const form = await req.formData();
    file = form.get("file");
    link = String(form.get("link") ?? "");
    prId = String(form.get("pr") ?? "");
  } catch {
    return NextResponse.json({ error: "richiesta-illeggibile" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "manca-file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "troppo-grande" }, { status: 413 });
  }

  const supabase = await createClient();

  // Di chi è la foto: il PR dal suo link, oppure Luka per un PR
  let id: string;
  if (link) {
    if (!LINK_PAPION.test(link)) return NextResponse.json({ error: "link" }, { status: 403 });
    const { data } = await supabase.rpc("papion_pr_app", { p_link: link });
    if (!data?.id) return NextResponse.json({ error: "link" }, { status: 403 });
    id = data.id as string;
  } else {
    const { data: admin } = await supabase.rpc("is_admin");
    if (!admin || !/^[0-9a-f-]{36}$/.test(prId)) {
      return NextResponse.json({ error: "non-autorizzato" }, { status: 403 });
    }
    id = prId;
  }

  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(512, 512, { fit: "cover", position: "attention" })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "non-e-un-immagine" }, { status: 415 });
  }

  const caso = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const key = `papion-pr/${id}/${caso}.webp`;
  try {
    await caricaSuR2(key, webp, "image/webp");
  } catch (e) {
    return NextResponse.json(
      { error: "r2-fallito", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  const { data: vecchia, error } = link
    ? await supabase.rpc("papion_pr_foto", { p_link: link, p_key: key })
    : await supabase.rpc("admin_papion_pr_foto", { p_id: id, p_key: key });
  if (error || vecchia === null) {
    await cancellaSuR2(key).catch(() => {});
    return NextResponse.json({ error: "registrazione-fallita", detail: error?.message }, { status: 500 });
  }
  if (typeof vecchia === "string" && CHIAVE.test(vecchia)) {
    await cancellaSuR2(vecchia).catch(() => {});
  }

  return NextResponse.json({ ok: true, foto: key });
}
