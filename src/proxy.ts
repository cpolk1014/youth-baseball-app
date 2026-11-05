import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

/** The public website's pages (src/app/(site)/). */
export const SITE_PATHS = [
  "/welcome",
  "/features",
  "/ai",
  "/pricing",
  "/clubs",
  "/parents",
  "/story",
  "/privacy",
  "/terms",
  "/robots.txt",
  "/sitemap.xml",
];

const PUBLIC_PATHS = [
  "/login",
  "/auth",
  "/icon",
  "/apple-icon",
  "/manifest.webmanifest",
  "/sw.js",
  "/api/stripe/webhook",
  // The public website (anyone can read it, signed in or not).
  ...SITE_PATHS,
];

/** Refresh the Supabase session cookie and send signed-out users to /login. */
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet)
          response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  // rallycap.team for someone signed out: the public website's home page.
  if (path === "/" && !data?.claims) {
    const home = request.nextUrl.clone();
    home.pathname = "/welcome";
    const rewrite = NextResponse.rewrite(home);
    for (const cookie of response.cookies.getAll()) rewrite.cookies.set(cookie);
    return rewrite;
  }
  if (data?.claims || PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    return response;
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  // Keep the query too (e.g. a club code link: /members?code=…).
  login.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
  const redirect = NextResponse.redirect(login);
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
