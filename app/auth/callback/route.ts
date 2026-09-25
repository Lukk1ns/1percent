import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // Formato token_hash: funziona anche se la mail viene aperta in un
  // browser diverso da quello che l'ha richiesta (niente verifier PKCE).
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type") as EmailOtpType | null;
  // Destinazione interna richiesta (es. /admin/dashboard per lo staff).
  const nextParam = url.searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
    ? nextParam
    : null;

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  } else if (tokenHash && otpType) {
    const supabase = await createClient();
    await supabase.auth.verifyOtp({ type: otpType, token_hash: tokenHash });
  }

  // Se ha già un profilo → card, altrimenti → registrazione
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    // Rientro via magic link: si va dove chiedeva il link, ma **non**
    // dentro il pannello se non se ne ha diritto. Prima bastava un link
    // con `next=/admin/dashboard` — o passare dall'accesso staff con una
    // mail qualsiasi — per ritrovarsi davanti ai comandi.
    if (next) {
      if (next.startsWith("/admin")) {
        const { data: isAdmin } = await supabase.rpc("is_admin");
        const { data: isStaff } = await supabase.rpc("is_staff");
        if (isAdmin) {
          return NextResponse.redirect(new URL(next, url.origin));
        }
        if (isStaff) {
          return NextResponse.redirect(new URL("/admin/porta", url.origin));
        }
        return NextResponse.redirect(new URL("/", url.origin));
      }
      return NextResponse.redirect(new URL(next, url.origin));
    }

    // Staff PRIMA di tutto: chi è nella tabella admins va sempre in
    // dashboard, mai in registrazione. Così il login admin funziona anche
    // se il template email perde il parametro next=/admin/dashboard.
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (isAdmin) {
      return NextResponse.redirect(new URL("/admin/dashboard", url.origin));
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

    // È entrato davvero, ma di lui non sappiamo niente: quasi sempre
    // perché si era iscritto con un'altra mail. Mandarlo a "Chi sei?"
    // senza dirglielo lo porta a rifarsi l'account e a perdere quello
    // che aveva — il `rientro=1` fa comparire l'avviso con l'indirizzo
    // con cui è entrato.
    return NextResponse.redirect(new URL("/unisciti?rientro=1", url.origin));
  }

  return NextResponse.redirect(new URL("/unisciti", url.origin));
}
