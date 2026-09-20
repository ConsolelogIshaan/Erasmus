import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Root proxy — session refresh + route protection (Next.js 16+).
 * Keep this file thin; business logic lives in lib/supabase/middleware.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap, robots
     * - api/stream (streaming chunks & subtitles)
     * - public assets with file extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|api/stream|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
