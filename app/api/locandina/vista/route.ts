import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { BUCKET_NITIDA, filigranaSvg } from "@/lib/locandina";

/**
 * La locandina nitida, firmata con il nome di chi la sta guardando.
 *
 * Serve a una cosa sola: se un PR fa girare lo screenshot dell'ospite
 * prima del momento, dallo screenshot si risale a lui. La firma viene
 * **fusa dentro i pixel dal server** — non è un velo messo sopra dal
 * browser, quindi non si toglie con gli strumenti dello sviluppatore e
 * resta anche se l'immagine viene salvata o rigirata.
 *
 * Chi decide se l'immagine esce è sempre il deposito: qui si scarica il
 * file con la sessione di chi chiede, quindi valgono le stesse regole di
 * prima (la nitida la leggono i membri e lo staff). Chi non è dei nostri
 * riceve 403 e sul sito resta la sfocata.
 *
 * Niente cache: ogni persona deve ricevere la propria copia, e nessuna
 * copia deve restare su una CDN a disposizione di altri.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Solo chiavi della forma `<uuid>/locandina.webp`. */
const CHIAVE_VALIDA = /^[0-9a-f-]{36}\/locandina\.webp$/i;

export async function GET(req: Request) {
  const chiave = new URL(req.url).searchParams.get("key") ?? "";
  if (!CHIAVE_VALIDA.test(chiave)) {
    return new Response("chiave non valida", { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("non autenticato", { status: 401 });

  // Con cosa firmiamo: l'alias e il numero di tessera. Lo staff senza
  // profilo membro (l'account admin) viene firmato con la sua email.
  const { data: profilo } = await supabase
    .from("profiles")
    .select("alias,member_number")
    .eq("id", user.id)
    .single();

  let firma: string;
  if (profilo) {
    firma = `${profilo.alias} · #${String(profilo.member_number).padStart(4, "0")}`;
  } else {
    const { data: staff } = await supabase.rpc("am_i_staff");
    if (!staff) return new Response("non autorizzato", { status: 403 });
    firma = `staff · ${user.email ?? user.id.slice(0, 8)}`;
  }

  // Il permesso vero è qui: se il deposito dice di no, non esce niente
  const { data: file, error } = await supabase.storage.from(BUCKET_NITIDA).download(chiave);
  if (error || !file) return new Response("non autorizzato", { status: 403 });

  const originale = Buffer.from(await file.arrayBuffer());

  let firmata: Buffer;
  try {
    const img = sharp(originale);
    const { width, height } = await img.metadata();
    if (!width || !height) throw new Error("immagine illeggibile");
    firmata = await img
      .composite([{ input: filigranaSvg(width, height, firma), top: 0, left: 0 }])
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return new Response("elaborazione fallita", { status: 500 });
  }

  return new Response(new Uint8Array(firmata), {
    headers: {
      "Content-Type": "image/webp",
      // Ogni copia è personale: non deve finire in nessuna cache condivisa
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
