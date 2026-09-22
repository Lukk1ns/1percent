import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { r2Configurato, urlFirmato } from "@/lib/r2";

// Una foto, in uno dei tre formati.
//
// Qui dentro sta il muro: il permesso lo decide il database
// (foto_chiave risponde solo a chi ha un profilo), non il browser.
// Chi non è iscritto non riceve nessun indirizzo, quindi al file non
// ci arriva nemmeno sapendo come si chiama.
//
// Chi ha diritto viene rimandato a un indirizzo firmato che scade:
// non è un link da girare in giro.

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!r2Configurato()) {
    return NextResponse.json({ error: "r2-non-configurato" }, { status: 503 });
  }

  const { id } = await params;
  const formato = new URL(req.url).searchParams.get("f") ?? "thumb";
  if (!["thumb", "medium", "hd"].includes(formato)) {
    return NextResponse.json({ error: "formato-sconosciuto" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: chiave, error } = await supabase.rpc("foto_chiave", {
    p_id: id,
    p_formato: formato,
  });

  if (error || !chiave) {
    return NextResponse.json({ error: "non-autorizzato" }, { status: 403 });
  }

  const url = await urlFirmato(chiave);

  return NextResponse.redirect(url, {
    status: 307,
    headers: {
      // Privata: la tiene il browser di chi guarda, non una cache di mezzo.
      "Cache-Control": "private, max-age=1800",
    },
  });
}
