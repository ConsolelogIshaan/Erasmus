"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { CommandTrigger } from "@/components/layout/command-trigger";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Logo } from "@/components/layout/logo";
import { UserMenu, type UserMenuUser } from "@/components/layout/user-menu";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  user: UserMenuUser;
  isFullBleed?: boolean;
}

/**
 * Transparent floating top bar: Erasmus logo + search + profile.
 * Completely transparent and seamless with zero blur overlay.
 */
export function AppHeader({ user, isFullBleed }: AppHeaderProps) {
  const pathname = usePathname();
  const isHomeScreen = pathname === ROUTES.dashboard || pathname === ROUTES.home;

  return (
    <header
      className={cn(
        "flex h-[var(--header-height)] items-center gap-2.5 px-3 sm:gap-3 sm:px-5 bg-transparent border-0",
        isFullBleed
          ? "fixed top-0 left-0 md:left-[var(--current-sidebar-width)] right-0 z-40"
          : "sticky top-0 z-40"
      )}
    >
      <div className="md:hidden">
        <MobileNav />
      </div>

      {/* Logo only rendered on the home screen */}
      {isHomeScreen ? (
        <div className="hidden min-w-0 md:block drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
          <Logo href={ROUTES.dashboard} />
        </div>
      ) : null}

      <div className="min-w-0 flex-1" aria-hidden />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
        <CommandTrigger className="hidden md:inline-flex" />
        <CommandTrigger compact className="md:hidden" />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
