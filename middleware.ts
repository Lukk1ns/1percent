import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Il controllo che arriva **prima** della pagina.
 *
 * Restava qui l'ultimo pezzo del guaio del 25 settembre: il filtro
 * diceva `isStaffLoggedIn = Boolean(user?.email)`, cioè considerava
 * staff chiunque avesse una mail. Da solo non apriva più niente — la
 * GuardiaAdmin e le funzioni del database rifiutano gli estranei — ma
 * era la stessa idea sbagliata, lasciata accesa in un angolo. E finché
 * una riga del genere è viva, prima o poi qualcuno ci si appoggia.
 *
 * Adesso il permesso si chiede al database, sul server, prima che la
 * pagina parta:
 *   · porta e scanner → staff, operatori, account manager;
 *   · tutto il resto  → solo admin.
 *
 * Se il database non risponde (rete, manutenzione) si lascia passare:
 * a quel punto decide la GuardiaAdmin nel browser, come oggi. Meglio
 * una porta in meno che chiudere fuori Luka in mezzo a una serata.
 */

const DA_STAFF = ["/admin/porta", "/admin/scan"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  // L'accesso staff deve restare raggiungibile, altrimenti è un giro chiuso.
  if (pathname.startsWith("/admin/login")) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const bastaStaff = DA_STAFF.some((p) => pathname.startsWith(p));

  try {
    const { data: admin, error } = await supabase.rpc("is_admin");
    if (error) return response; // decide il browser
    if (admin) return response;

    if (bastaStaff) {
      const [staff, manager] = await Promise.all([
        supabase.rpc("is_staff"),
        supabase.rpc("is_account_manager"),
      ]);
      if (staff.error || manager.error) return response;
      if (staff.data || manager.data) return response;
    }
  } catch {
    return response;
  }

  // Ha un account ma non i diritti: fuori dal pannello, senza passare
  // dall'accesso staff — era quello a far credere che bastasse entrare.
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/admin/:path*"],
};
