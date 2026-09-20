import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { withAuthBudget } from "@/lib/supabase/fetch";
import type { User } from "@supabase/supabase-js";
import type { Profile, UserPreferences, UserSettings } from "@/types";

/**
 * Server-side user data access.
 * Keeps Supabase queries out of page components for cleaner composition.
 * Wrapped in React cache to deduplicate calls within a single request pass.
 */

/**
 * The signed-in user, or `null`.
 *
 * Bounded by a total-time budget: this runs in ~20 render paths (including the
 * public marketing layout), and an unresponsive auth service would otherwise
 * stall each of them for as long as the Supabase SDK keeps retrying. Treating a
 * stalled check as "signed out" degrades to the public view instead of hanging.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const localUserCookie = cookieStore.get("sb-local-auth-user");
  const hasAuthCookie = allCookies.some(
    (c) => c.name.startsWith("sb-") && (c.name.includes("-auth-token") || c.name.endsWith("-token")),
  );

  if (!hasAuthCookie && !localUserCookie) {
    return null;
  }

  if (hasAuthCookie) {
    const remoteUser = await withAuthBudget(async () => {
      const supabase = await createClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        return null;
      }

      return user;
    }, null);

    if (remoteUser) return remoteUser;
  }

  if (localUserCookie?.value) {
    try {
      const parsed = JSON.parse(localUserCookie.value) as { email: string; name: string };
      return {
        id: "local-user-" + Buffer.from(parsed.email).toString("hex").slice(0, 16),
        email: parsed.email,
        user_metadata: { full_name: parsed.name, name: parsed.name },
        app_metadata: { provider: "email" },
        aud: "authenticated",
        created_at: new Date().toISOString(),
      } as unknown as User;
    } catch {}
  }

  return null;
});

export const getProfile = cache(async function getProfile(userId: string): Promise<Profile | null> {
  if (userId.startsWith("local-user-")) {
    const cookieStore = await cookies();
    const localUserCookie = cookieStore.get("sb-local-auth-user");
    if (localUserCookie?.value) {
      try {
        const parsed = JSON.parse(localUserCookie.value) as { email: string; name: string };
        return {
          id: userId,
          username: parsed.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
          display_name: parsed.name,
          avatar_url: null,
          bio: null,
          website: null,
          is_public: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      } catch {}
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("getProfile error:", error.message);
    return null;
  }

  return data;
});

export const getUserSettings = cache(async function getUserSettings(userId: string): Promise<UserSettings | null> {
  if (userId.startsWith("local-user-")) {
    return {
      id: "settings-" + userId,
      user_id: userId,
      theme: "dark",
      density: "comfortable",
      language: "en",
      timezone: null,
      email_notifications: true,
      marketing_emails: false,
      reduced_motion: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("getUserSettings error:", error.message);
    return null;
  }

  return data;
});

export const getUserPreferences = cache(async function getUserPreferences(
  userId: string,
): Promise<UserPreferences | null> {
  if (userId.startsWith("local-user-")) {
    return {
      id: "prefs-" + userId,
      user_id: userId,
      sidebar_collapsed: false,
      default_landing: "/dashboard",
      content_languages: ["en"],
      spoiler_protection: false,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("getUserPreferences error:", error.message);
    return null;
  }

  return data;
});

/**
 * Bundled load for app shell hydration.
 */
export const getSessionContext = cache(async function getSessionContext() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, profile: null, settings: null, preferences: null };
  }

  const [profile, settings, preferences] = await Promise.all([
    getProfile(user.id),
    getUserSettings(user.id),
    getUserPreferences(user.id),
  ]);

  return { user, profile, settings, preferences };
});
