import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { safeRedirectUrl } from "@/lib/utils/safe-redirect";
import { ROUTES } from "@/constants/routes";

/**
 * OAuth / email confirmation callback.
 * Exchanges the auth code for a session and redirects into the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const authError = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (authError) {
    console.error(`[auth/callback] OAuth provider error: ${authError} - ${errorDescription}`);
    return NextResponse.redirect(`${origin}${ROUTES.login}?error=${encodeURIComponent(authError)}`);
  }

  if (code) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[auth/callback] exchangeCodeForSession failed:", error.message, error);
      } else if (data?.session) {
        return NextResponse.redirect(safeRedirectUrl(origin, next, ROUTES.dashboard));
      }
    } catch (err) {
      console.error("[auth/callback] Unexpected error during code exchange:", err);
    }
  }

  return NextResponse.redirect(`${origin}${ROUTES.login}?error=auth_callback`);
}
