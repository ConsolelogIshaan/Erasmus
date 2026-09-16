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
 * Blends seamlessly into the ambient atmosphere across all pages when unscrolled
 * (completely transparent, borderless, with a delicate feathered liquid glass meniscus and micro-sheen).
 * Smoothly transitions to a luminous liquid glass frosted header when content scrolls underneath.
 */
export function AppHeader({ user, isFullBleed }: AppHeaderProps) {
  const [isScrolled, setIsScrolled] = React.useState(false);
  const pathname = usePathname();
  const isHomeScreen = pathname === ROUTES.dashboard || pathname === ROUTES.home;

  React.useEffect(() => {
    const main = document.getElementById("main-content");
    const handleScroll = () => {
      const scrollY = main ? main.scrollTop : window.scrollY;
      setIsScrolled(scrollY > 20);
    };

    if (main) {
      main.addEventListener("scroll", handleScroll, { passive: true });
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      if (main) {
        main.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("scroll", handleScroll);
    };
  }, [pathname]);

  return (
    <header
      className={cn(
        "flex h-[var(--header-height)] items-center gap-2.5 px-3 transition-all duration-300 sm:gap-3 sm:px-5",
        isFullBleed
          ? "fixed top-0 left-0 md:left-[var(--current-sidebar-width)] right-0 z-40 border-b-0"
          : "sticky top-0 z-40",
        isScrolled
          ? "border-b border-white/[0.08] bg-[#040710]/65 backdrop-blur-3xl backdrop-saturate-[190%] backdrop-contrast-[105%] shadow-[0_4px_30px_rgba(0,0,0,0.35)]"
          : "border-b border-transparent bg-transparent"
      )}
      style={{
        boxShadow: isScrolled
          ? "inset 0 -1px 0 0 rgba(255, 255, 255, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.04), 0 8px 32px -4px rgba(0, 0, 0, 0.4)"
          : undefined,
      }}
    >
      {/* Seamless liquid glass feathered ambient overlay for unscrolled state */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 transition-opacity duration-300",
          isScrolled ? "opacity-0" : "opacity-100"
        )}
        style={{
          background:
            "linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 0%, rgba(0, 0, 0, 0.12) 45%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, black 40%, transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, black 0%, black 40%, transparent 100%)",
          backdropFilter: "blur(5px)",
          WebkitBackdropFilter: "blur(5px)",
        }}
        aria-hidden
      />

      {/* Top meniscus specular highlight */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent"
        aria-hidden
      />

      {/* Subtle liquid caustic bloom matching the sidebar aesthetic */}
      <div
        className="pointer-events-none absolute -top-8 right-1/4 h-20 w-64 rounded-full bg-cyan-400/[0.025] blur-3xl"
        aria-hidden
      />

      {/* Refractive bottom specular highlight when scrolled */}
      {isScrolled && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
          aria-hidden
        />
      )}

      <div className="md:hidden">
        <MobileNav />
      </div>

      {/* Logo only rendered on the home screen */}
      {isHomeScreen ? (
        <div
          className={cn(
            "hidden min-w-0 md:block transition-all",
            !isScrolled ? "drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]" : ""
          )}
        >
          <Logo href={ROUTES.dashboard} />
        </div>
      ) : null}

      <div className="min-w-0 flex-1" aria-hidden />

      <div
        className={cn(
          "ml-auto flex items-center gap-1.5 sm:gap-2 transition-all",
          !isScrolled ? "drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]" : ""
        )}
      >
        <CommandTrigger className="hidden md:inline-flex" />
        <CommandTrigger compact className="md:hidden" />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
