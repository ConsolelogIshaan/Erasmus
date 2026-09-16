"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { PageTransition } from "@/components/layout/page-transition";
import { KeyboardShortcutsProvider } from "@/components/layout/keyboard-shortcuts-provider";
import { CommandPalette } from "@/features/command/command-palette";
import { AmbientBackground } from "@/components/layout/ambient-background";
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
 * Detail pages with cinematic hero backdrops (/tv/[id], /movie/[id]) and Discover (/discover)
 * render full-bleed, with the persistent AmbientBackground flowing seamlessly underneath
 * the translucent frosted glass header, sidebar, and all scrollable page sections.
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

        {/* Dedicated Page-Level Ambient Background Layer */}
        <AmbientBackground />

        <Sidebar isFullBleed={isFullBleed} />

        <div
          className={cn(
            "relative z-[1] flex min-w-0 flex-1 flex-col transition-all duration-300",
            isFullBleed ? "pl-0" : ""
          )}
        >
          <AppHeader user={user} isFullBleed={isFullBleed} />
          <main
            id="main-content"
            className={cn(
              "relative z-[1] min-w-0 flex-1 overflow-y-auto scroll-smooth bg-transparent",
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
