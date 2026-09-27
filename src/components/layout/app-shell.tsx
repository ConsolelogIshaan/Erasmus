"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ErasmusFloatingNavbar } from "@/components/layout/erasmus-floating-navbar";
import { PageTransition } from "@/components/layout/page-transition";
import { KeyboardShortcutsProvider } from "@/components/layout/keyboard-shortcuts-provider";
import { AmbientBackground } from "@/components/layout/ambient-background";
import { LAYOUT } from "@/constants/app";
import { cn } from "@/lib/utils";
import type { UserMenuUser } from "@/components/layout/user-menu";

interface AppShellProps {
  user: UserMenuUser;
  children: React.ReactNode;
}

/**
 * Full-width application stage with persistent floating navigation.
 * Detail pages with cinematic hero backdrops (/tv/[id], /movie/[id]) and discovery showcase pages
 * (/discover, /movies, /tv, /anime) render full-bleed, with the persistent AmbientBackground
 * flowing seamlessly underneath the floating navbar and all scrollable page sections.
 */
export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const isFullBleed = Boolean(
    pathname &&
    (/^\/(tv|movie)\/[^/]+$/.test(pathname) ||
      /^\/(discover|movies|tv|anime)\/?$/.test(pathname)),
  );

  return (
    <KeyboardShortcutsProvider>
      <div
        className="bg-background relative flex min-h-dvh w-full"
        style={
          {
            "--header-height": `${LAYOUT.headerHeight}px`,
            "--floating-nav-clearance": "6.5rem",
          } as React.CSSProperties
        }
      >
        {/* Dedicated Page-Level Ambient Background Layer */}
        <AmbientBackground />

        <ErasmusFloatingNavbar user={user} />

        <div
          className={cn(
            "relative z-[1] flex min-w-0 flex-1 flex-col transition-all duration-300",
            isFullBleed ? "pl-0" : "",
          )}
        >
          <main
            id="main-content"
            className={cn(
              "relative z-[1] min-w-0 flex-1 overflow-y-auto scroll-smooth bg-transparent",
              isFullBleed ? "h-dvh" : "",
            )}
          >
            {isFullBleed ? (
              <PageTransition>{children}</PageTransition>
            ) : (
              <div className="content-container min-w-0 pt-[var(--floating-nav-clearance)] pb-6 sm:pb-8 lg:pb-10">
                <PageTransition>{children}</PageTransition>
              </div>
            )}
          </main>
        </div>

      </div>
    </KeyboardShortcutsProvider>
  );
}
