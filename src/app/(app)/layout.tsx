import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { ROUTES } from "@/constants/routes";
import { getAppShellUser } from "@/lib/services/user-service";

export const dynamic = "force-dynamic";

/**
 * Authenticated app layout. Middleware already guards routes; this provides
 * user profile data for the shell without making redundant database calls.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getAppShellUser();

  if (!user) {
    redirect(ROUTES.login);
  }

  return <AppShell user={user}>{children}</AppShell>;
}
