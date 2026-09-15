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
 * Sleek floating top bar: Erasmus logo + search + profile.
 * On media detail pages, floats with subtle, toned-down translucency over the trailer video
 * (delicate soft blur and gentle airy gradient that feathers seamlessly into the scene with zero harsh lines).
 * Smoothly transitions to solid frosted glass only when scrolling down into content.
 */
export function AppHeader({ user, isFullBleed }: AppHeaderProps) {
  const [isScrolled, setIsScrolled] = React.useState(false);
  const pathname = usePathname();
  const isHomeScreen = pathname === ROUTES.dashboard || pathname === ROUTES.home;

  React.useEffect(() => {
    if (!isFullBleed) return;
    const main = document.getElementById("main-content");
    if (!main) return;
    const handleScroll = () => {
      setIsScrolled(main.scrollTop > 30);
    };
    main.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => main.removeEventListener("scroll", handleScroll);
  }, [isFullBleed]);

  return (
    <header
      className={cn(
        "flex h-[var(--header-height)] items-center gap-2.5 px-3 transition-all duration-300 sm:gap-3 sm:px-5",
        isFullBleed
          ? cn(
              "fixed top-0 left-0 md:left-[var(--current-sidebar-width)] right-0 z-40 border-b-0",
              isScrolled
                ? "border-b border-white/[0.08] bg-black/80 backdrop-blur-xl shadow-lg"
                : "bg-transparent"
            )
          : "sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl dark:border-white/[0.08]"
      )}
    >
      {/* Toned-down, feathered translucent frosted backdrop overlay for unscrolled hero */}
      {isFullBleed && !isScrolled ? (
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-black/35 via-black/12 to-transparent backdrop-blur-[5px]"
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, black 0%, black 55%, transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, black 0%, black 55%, transparent 100%)",
          }}
          aria-hidden
        />
      ) : null}

      <div className="md:hidden">
        <MobileNav />
      </div>

      {/* Logo only rendered on the home screen */}
      {isHomeScreen ? (
        <div
          className={cn(
            "hidden min-w-0 md:block transition-all",
            isFullBleed && !isScrolled ? "drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]" : ""
          )}
        >
          <Logo href={ROUTES.dashboard} />
        </div>
      ) : null}

      <div className="min-w-0 flex-1" aria-hidden />

      <div
        className={cn(
          "ml-auto flex items-center gap-1.5 sm:gap-2 transition-all",
          isFullBleed && !isScrolled ? "drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]" : ""
        )}
      >
        <CommandTrigger className="hidden md:inline-flex" />
        <CommandTrigger compact className="md:hidden" />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
