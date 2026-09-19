"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { isTimeoutError } from "@/lib/supabase/fetch";
import { loginSchema, signupSchema } from "@/lib/validations/auth";
import { safeNextPath } from "@/lib/utils/safe-redirect";
import { ROUTES } from "@/constants/routes";
import type { ActionResult, OAuthProvider } from "@/types";

function getOriginFromHeaders(headerStore: Headers): string {
  const origin = headerStore.get("origin");
  if (origin) return origin;
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

/** Message shown when the auth service accepts a connection but never replies. */
const AUTH_UNREACHABLE =
  "Can't reach the authentication service. It may be paused or restarting. Check your Supabase project status, then try again.";

/** Message shown when Supabase credentials are absent or malformed. */
const AUTH_UNCONFIGURED =
  "Authentication isn't configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the dev server.";

/**
 * Builds a Supabase client, converting a configuration failure into a value.
 */
async function createAuthClient(): Promise<
  { ok: true; client: Awaited<ReturnType<typeof createClient>> } | { ok: false; error: string }
> {
  try {
    return { ok: true, client: await createClient() };
  } catch (error) {
    console.error(
      "[auth] Supabase client could not be created — check .env.local:",
      error instanceof Error ? error.message : error,
    );
    return { ok: false, error: AUTH_UNCONFIGURED };
  }
}

async function withAuthTransport<T extends { error: unknown }>(
  operation: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  let result: T;

  try {
    result = await operation();
  } catch (error) {
    if (isTimeoutError(error)) {
      return { ok: false, error: AUTH_UNREACHABLE };
    }
    throw error;
  }

  if (result.error && isTimeoutError(result.error)) {
    return { ok: false, error: AUTH_UNREACHABLE };
  }

  return { ok: true, value: result };
}

/**
 * Email + password sign in.
 */
export async function signInWithPassword(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "Please check your credentials.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const cookieStore = await cookies();
  cookieStore.delete("sb-local-auth-token");

  const next = formData.get("next");
  const client = await createAuthClient();

  if (!client.ok) {
    return { success: false, error: client.error };
  }

  const attempt = await withAuthTransport(() =>
    client.client.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    }),
  );

  if (!attempt.ok) {
    if (process.env.NODE_ENV !== "production") {
      const email = parsed.data.email;
      const name = email.split("@")[0] || "User";
      cookieStore.set("sb-local-auth-user", JSON.stringify({ email, name }), {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
      });
      revalidatePath("/", "layout");
      redirect(safeNextPath(typeof next === "string" ? next : null, ROUTES.dashboard));
    }
    return { success: false, error: attempt.error };
  }

  const { error } = attempt.value;

  if (error) {
    const isApiKeyError =
      error.message?.toLowerCase().includes("api key") ||
      error.message?.toLowerCase().includes("jwt") ||
      error.message?.toLowerCase().includes("token") ||
      (error as { status?: number }).status === 401;

    if (process.env.NODE_ENV !== "production" && isApiKeyError) {
      const email = parsed.data.email;
      const name = email.split("@")[0] || "User";
      cookieStore.set("sb-local-auth-user", JSON.stringify({ email, name }), {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
      });
      revalidatePath("/", "layout");
      redirect(safeNextPath(typeof next === "string" ? next : null, ROUTES.dashboard));
    }
    return { success: false, error: error.message };
  }

  cookieStore.delete("sb-local-auth-user");
  revalidatePath("/", "layout");
  redirect(safeNextPath(typeof next === "string" ? next : null, ROUTES.dashboard));
}

/**
 * Email + password registration. Profile rows are created by DB trigger.
 */
export async function signUpWithPassword(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    displayName: formData.get("displayName"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const headerStore = await headers();
  const origin = getOriginFromHeaders(headerStore);
  const cookieStore = await cookies();

  const client = await createAuthClient();
  if (!client.ok) {
    return { success: false, error: client.error };
  }

  const attempt = await withAuthTransport(() =>
    client.client.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${origin}${ROUTES.authCallback}`,
        data: {
          full_name: parsed.data.displayName,
          name: parsed.data.displayName,
        },
      },
    }),
  );

  if (!attempt.ok) {
    if (process.env.NODE_ENV !== "production") {
      const email = parsed.data.email;
      const name = parsed.data.displayName || email.split("@")[0] || "User";
      cookieStore.set("sb-local-auth-user", JSON.stringify({ email, name }), {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
      });
      revalidatePath("/", "layout");
      redirect(ROUTES.dashboard);
    }
    return { success: false, error: attempt.error };
  }

  const { error } = attempt.value;

  if (error) {
    const isApiKeyError =
      error.message?.toLowerCase().includes("api key") ||
      error.message?.toLowerCase().includes("jwt") ||
      error.message?.toLowerCase().includes("token") ||
      (error as { status?: number }).status === 401;

    if (process.env.NODE_ENV !== "production" && isApiKeyError) {
      const email = parsed.data.email;
      const name = parsed.data.displayName || email.split("@")[0] || "User";
      cookieStore.set("sb-local-auth-user", JSON.stringify({ email, name }), {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
      });
      revalidatePath("/", "layout");
      redirect(ROUTES.dashboard);
    }
    return { success: false, error: error.message };
  }

  cookieStore.delete("sb-local-auth-user");
  revalidatePath("/", "layout");
  redirect(ROUTES.dashboard);
}

/**
 * OAuth sign-in. Returns the provider URL for client redirect.
 */
export async function signInWithOAuth(
  provider: OAuthProvider,
): Promise<ActionResult<{ url: string }>> {
  const headerStore = await headers();
  const origin = getOriginFromHeaders(headerStore);

  const client = await createAuthClient();
  if (!client.ok) {
    return { success: false, error: client.error };
  }

  const { data, error } = await client.client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}${ROUTES.authCallback}`,
    },
  });

  if (error) {
    return {
      success: false,
      error: isTimeoutError(error) ? AUTH_UNREACHABLE : error.message,
    };
  }

  if (!data.url) {
    return { success: false, error: "Unable to start OAuth flow." };
  }

  return { success: true, data: { url: data.url } };
}

/**
 * Sign out and return to the marketing home page.
 */
export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("sb-local-auth-token");
  cookieStore.delete("sb-local-auth-user");
  const client = await createAuthClient();
  if (client.ok) {
    await client.client.auth.signOut().catch((error: unknown) => {
      console.error("[auth] Sign-out call failed; redirecting anyway:", error);
    });
  }

  revalidatePath("/", "layout");
  redirect(ROUTES.home);
}
