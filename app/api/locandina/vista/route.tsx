import { ImageResponse } from "next/og";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { BUCKET_NITIDA } from "@/lib/locandina";

/**
 * La locandina nitida, firmata con il nome di chi la sta guardando.
 *
 * Serve a una cosa sola: se un PR fa girare lo screenshot dell'ospite
 * prima del momento, dallo screenshot si risale a lui. La firma viene
 * **fusa dentro i pixel dal server** — non è un velo messo sopra dal
 * browser, quindi non si toglie con gli strumenti dello sviluppatore e
 * resta anche se l'immagine viene salvata e rigirata.
 *
 * Chi decide se l'immagine esce è sempre il deposito: qui si scarica il
 * file con la sessione di chi chiede, quindi valgono le stesse regole di
 * prima (la nitida la leggono i membri e lo staff). Chi non è dei nostri
 * riceve 403 e sul sito resta la sfocata.
 *
 * ⚠️ PERCHÉ NON UN SVG CON DENTRO DEL TESTO (provato, non funziona):
 * il motore che disegna gli SVG dentro sharp cerca i font nel sistema, e
 * sul server di Vercel di font non ce n'è nessuno. Risultato: nessun
 * errore e l'immagine esce identica, senza scritta. Verificato disegnando
 * la stessa funzione qui e là. Qui la scritta la compone `next/og`, che
 * il font se lo porta dietro (Geist) e non chiede niente al sistema.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Solo chiavi della forma `<uuid>/locandina.webp`. */
const CHIAVE_VALIDA = /^[0-9a-f-]{36}\/locandina\.webp$/i;

/** Inclinazione della firma, in gradi. */
const INCLINAZIONE = -30;

/**
 * Il riquadro di una persona non cambia mai: lo teniamo da parte invece
 * di ridisegnarlo a ogni apertura. Vive quanto vive il processo sul
 * server, quindi non serve svuotarlo.
 */
const riquadriPronti = new Map<string, Buffer>();

/**
 * Un riquadro con la firma scritta una volta, su fondo trasparente.
 *
 * Verrà inclinato e ripetuto su tutta la locandina: ogni ripetizione
 * contiene la firma intera, così anche un ritaglio dello screenshot
 * resta leggibile.
 */
async function riquadroFirma(testo: string, larghezza: number): Promise<Buffer> {
  const dim = Math.max(22, Math.round(larghezza / 32));
  const w = Math.round(testo.length * dim * 0.62 + dim * 5);
  const h = Math.round(dim * 3.4);
  const scarto = Math.max(1, Math.round(dim / 14));

  // Due copie sovrapposte: una scura spostata di poco, una chiara sopra.
  // Serve perché la locandina ha zone nere E zone bianche: con un solo
  // colore la firma sparisce su una delle due.
  const strato = (colore: string, dx: number, dy: number) => ({
    position: "absolute" as const,
    left: dx,
    top: dy,
    width: w,
    height: h,
    display: "flex" as const,
    alignItems: "center" as const,
    fontSize: dim,
    fontWeight: 700,
    letterSpacing: dim / 10,
    color: colore,
    whiteSpace: "nowrap" as const,
  });

  const img = new ImageResponse(
    (
      <div style={{ width: w, height: h, display: "flex", position: "relative", background: "transparent" }}>
        <div style={strato("rgba(0,0,0,0.42)", scarto, scarto)}>{testo}</div>
        <div style={strato("rgba(255,255,255,0.42)", 0, 0)}>{testo}</div>
      </div>
    ),
    { width: w, height: h },
  );
  return Buffer.from(await img.arrayBuffer());
}

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

    // Il riquadro viene scritto dritto, poi inclinato: inclinare
    // un'immagine è un lavoro di pixel, non chiede font a nessuno.
    const memo = `${firma}|${width}`;
    let inclinato = riquadriPronti.get(memo);
    if (!inclinato) {
      const dritto = await riquadroFirma(firma, width);
      inclinato = await sharp(dritto)
        .rotate(INCLINAZIONE, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      riquadriPronti.set(memo, inclinato);
    }

    firmata = await img
      // `tile` ripete il riquadro su tutta la locandina
      .composite([{ input: inclinato, tile: true, blend: "over" }])
      .webp({ quality: 82 })
      .toBuffer();
  } catch (e) {
    console.error("filigrana fallita", e);
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
