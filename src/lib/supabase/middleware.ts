import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import type { Database } from "@/types/database";
import { AUTH_ROUTES, PROTECTED_ROUTES, ROUTES } from "@/constants/routes";
import { createTimeoutFetch, withAuthBudget } from "@/lib/supabase/fetch";

/**
 * Hard ceiling for the whole session check, including any retries the Supabase
 * SDK performs internally.
 *
 * A per-request `fetch` timeout is not sufficient on its own: supabase-js
 * retries retryable transport failures with exponential backoff, so one
 * invocation can chain several attempts and blow past the platform's middleware
 * execution limit. On Vercel that surfaces as `MIDDLEWARE_INVOCATION_TIMEOUT`
 * (504) on *every* route, because this runs for every matched request — an auth
 * outage takes the whole site down, not just sign-in.
 */
const AUTH_CHECK_BUDGET_MS = 8_000;

/**
 * Refreshes the Supabase session and enforces route protection.
 * Invoked from the root proxy on every matched request.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Allow local boot without env (landing page still works).
  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const { pathname } = request.nextUrl;

  // Crucial: auth callback must NOT run getUser() in middleware.
  // The route handler at /auth/callback exchanges the code and sets the session.
  // Running getUser() here beforehand is unnecessary and risks exhausting the budget.
  if (pathname === ROUTES.authCallback || pathname.startsWith(`${ROUTES.authCallback}/`)) {
    return supabaseResponse;
  }

  const allCookies = request.cookies.getAll();
  const hasAuthCookie = allCookies.some(
    (c) => c.name.startsWith("sb-") && (c.name.includes("-auth-token") || c.name.endsWith("-token")),
  );

  const isProtected = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  const isAuthRoute = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  // If there is no auth cookie, the user is definitely unauthenticated.
  // Avoid an unnecessary remote network round-trip on public or unauthenticated page loads.
  if (!hasAuthCookie) {
    if (isProtected) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = ROUTES.login;
      redirectUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(redirectUrl);
    }
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    // 5,000ms gives plenty of headroom for international TLS handshakes
    global: { fetch: createTimeoutFetch(8_000) },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // IMPORTANT: avoid writing logic between createServerClient and getUser().
  // A simple getSession() is not enough for security — getUser() revalidates.
  const user = await withAuthBudget(
    async () => (await supabase.auth.getUser()).data.user,
    null,
    AUTH_CHECK_BUDGET_MS,
  );

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = ROUTES.login;
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthRoute && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = ROUTES.dashboard;
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
