import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { VOLTO_SIZE, BLUR_SIGMA, BLUR_LEVELS } from "@/lib/volto";

// Anteprima del blur SENZA salvare nulla:
// - default: solo il livello attivo ("è così che ti vedranno")
// - ?all=1  : i 3 livelli, per la pagina /profilo/prova (scelta di Luka)

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

  const all = new URL(req.url).searchParams.get("all") === "1";

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
  const levels = all
    ? BLUR_LEVELS
    : BLUR_LEVELS.filter((l) => l.sigma === BLUR_SIGMA);

  try {
    const base = sharp(input)
      .rotate()
      .resize(VOLTO_SIZE, VOLTO_SIZE, { fit: "cover", position: "attention" });

    const previews = await Promise.all(
      levels.map(async (l) => {
        const buf = await base
          .clone()
          .modulate({ saturation: 0.88 })
          .blur(l.sigma)
          .webp({ quality: 72 })
          .toBuffer();
        return {
          id: l.id,
          sigma: l.sigma,
          active: l.sigma === BLUR_SIGMA,
          dataUrl: `data:image/webp;base64,${buf.toString("base64")}`,
        };
      }),
    );

    return NextResponse.json({ previews });
  } catch {
    return NextResponse.json({ error: "not-image" }, { status: 415 });
  }
}
