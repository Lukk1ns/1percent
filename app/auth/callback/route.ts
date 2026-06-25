import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Se ha già un profilo → card, altrimenti → registrazione
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
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
