import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // Destinazione interna richiesta (es. /admin/dashboard per lo staff).
  const nextParam = url.searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
    ? nextParam
    : null;

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Se ha già un profilo → card, altrimenti → registrazione
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    // Rientro staff via magic link: vai alla destinazione richiesta.
    // L'autorizzazione vera è nella dashboard e nelle RPC (is_admin()).
    if (next) {
      return NextResponse.redirect(new URL(next, url.origin));
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    if (profile) {
      return NextResponse.redirect(new URL("/card", url.origin));
    }

    // Utente rientrato via magic link: UUID diverso dall'anonimo originale.
    // link_email_account() trova il profilo per email e aggiorna l'UUID.
    const { data: linked } = await supabase.rpc("link_email_account");
    if (linked) {
      return NextResponse.redirect(new URL("/card", url.origin));
    }
  }

  return NextResponse.redirect(new URL("/unisciti", url.origin));
}
