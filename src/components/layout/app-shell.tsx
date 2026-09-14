"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { PageTransition } from "@/components/layout/page-transition";
import { KeyboardShortcutsProvider } from "@/components/layout/keyboard-shortcuts-provider";
import { CommandPalette } from "@/features/command/command-palette";
import { useUI } from "@/providers/ui-provider";
import { LAYOUT } from "@/constants/app";
import { cn } from "@/lib/utils";
import type { UserMenuUser } from "@/components/layout/user-menu";

interface AppShellProps {
  user: UserMenuUser;
  children: React.ReactNode;
}

/**
 * Resizable sidebar + content.
 * Detail pages with cinematic hero backdrops (/tv/[id], /movie/[id])
 * render full-bleed from (0,0), allowing the trailer to flow seamlessly underneath
 * the translucent frosted glass header and sidebar with zero harsh borders or box edges.
 */
export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const { sidebarCollapsed } = useUI();
  const isFullBleed = Boolean(
    pathname && (/^\/(tv|movie)\/[^/]+$/.test(pathname) || /^\/discover\/?$/.test(pathname))
  );

  const sidebarWidth = sidebarCollapsed
    ? LAYOUT.sidebarCollapsedWidth
    : LAYOUT.sidebarWidth;

  return (
    <KeyboardShortcutsProvider>
      <div
        className="relative flex min-h-dvh w-full bg-background"
        style={
          {
            "--current-sidebar-width": `${sidebarWidth}px`,
            "--header-height": `${LAYOUT.headerHeight}px`,
          } as React.CSSProperties
        }
      >
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden opacity-50 dark:opacity-40"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 10% 0%, hsl(210 100% 56% / 0.1), transparent 55%)",
          }}
          aria-hidden
        />

        <Sidebar isFullBleed={isFullBleed} />

        <div
          className={cn(
            "relative z-0 flex min-w-0 flex-1 flex-col transition-all duration-300",
            isFullBleed ? "pl-0" : ""
          )}
        >
          <AppHeader user={user} isFullBleed={isFullBleed} />
          <main
            id="main-content"
            className={cn(
              "relative z-0 min-w-0 flex-1 overflow-y-auto scroll-smooth",
              isFullBleed ? "h-dvh" : ""
            )}
          >
            {isFullBleed ? (
              <PageTransition>{children}</PageTransition>
            ) : (
              <div className="content-container min-w-0 py-6 sm:py-8 lg:py-10">
                <PageTransition>{children}</PageTransition>
              </div>
            )}
          </main>
        </div>

        <CommandPalette />
      </div>
    </KeyboardShortcutsProvider>
  );
}
