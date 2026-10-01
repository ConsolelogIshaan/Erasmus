"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { Bookmark, Film, Heart, Home, Target, Tv, Users } from "lucide-react";

import { AnimeIcon } from "@/components/layout/anime-icon";
import { SearchLink } from "@/components/layout/search-link";
import { MobileNav } from "@/components/layout/mobile-nav";
import { UserMenu, type UserMenuUser } from "@/components/layout/user-menu";
import { APP_NAME } from "@/constants/app";
import { ROUTES } from "@/constants/routes";
import type { NavIcon } from "@/constants/navigation";
import { cn } from "@/lib/utils";
import styles from "./erasmus-floating-navbar.module.css";

const PRIMARY_NAV = [
  { title: "Home", href: ROUTES.discover, icon: Home },
  { title: "TV Shows", href: ROUTES.tv, icon: Tv },
  { title: "Movies", href: ROUTES.movies, icon: Film },
  { title: "Anime", href: ROUTES.anime, icon: AnimeIcon },
  { title: "For You", href: ROUTES.recommendations, icon: Target },
  { title: "Favorites", href: ROUTES.favorites, icon: Heart },
  { title: "Friends", href: ROUTES.friends, icon: Users },
] as const;

function isRouteActive(pathname: string, href: string) {
  if (href === ROUTES.discover) return pathname === ROUTES.discover;
  if (href === ROUTES.movies) {
    return pathname === ROUTES.movies || pathname.startsWith("/movie/");
  }
  if (href === ROUTES.tv) {
    return pathname === ROUTES.tv || pathname.startsWith("/tv/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface NavLinkProps {
  href: string;
  title: string;
  icon: NavIcon;
  active: boolean;
  animateIndicator: boolean;
}

function NavLink({ href, title, icon: Icon, active, animateIndicator }: NavLinkProps) {
  const reduceMotion = useReducedMotion();

  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex h-9 items-center rounded-full px-4 text-[0.82rem] font-medium whitespace-nowrap lg:text-sm",
        styles.navLink,
        "focus-visible:ring-2 focus-visible:ring-white/55 focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none",
      )}
    >
      {active && (
        <motion.span
          layoutId={reduceMotion || !animateIndicator ? undefined : "navbar-active"}
          initial={false}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className={styles.activeIndicator}
          style={{ borderRadius: 999 }}
          aria-hidden="true"
        />
      )}
      <span className={styles.navIcon} aria-hidden="true">
        <Icon className="size-3.5 shrink-0" />
      </span>
      <span className={styles.navLabel}>{title}</span>
    </Link>
  );
}

/** Persistent viewport-centered navigation for the authenticated application. */
export function ErasmusFloatingNavbar({ user }: { user: UserMenuUser }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = React.useState(false);
  const [pointerNavigation, setPointerNavigation] = React.useState(false);
  const layoutId = React.useId();

  React.useEffect(() => {
    const scrollRoot = document.getElementById("main-content");
    if (!scrollRoot) return;

    const update = () => setScrolled(Math.max(scrollRoot.scrollTop, window.scrollY) > 24);
    update();
    scrollRoot.addEventListener("scroll", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      scrollRoot.removeEventListener("scroll", update);
      window.removeEventListener("scroll", update);
    };
  }, [pathname]);

  const watchlistActive = isRouteActive(pathname, ROUTES.watchlist);

  return (
    <header
      className="pointer-events-none fixed inset-x-0 top-3 z-40 px-3 md:top-5 md:px-4"
      onPointerDownCapture={() => setPointerNavigation(true)}
      onKeyDownCapture={() => setPointerNavigation(false)}
    >
      <LayoutGroup id={layoutId}>
        <div
          data-scrolled={scrolled || undefined}
          data-keyboard={!pointerNavigation || undefined}
          className={cn(
            styles.surface,
            "pointer-events-auto mx-auto flex h-14 w-full items-center rounded-full px-2",
            "min-[900px]:h-[3.25rem] min-[900px]:w-fit min-[900px]:max-w-[calc(100vw-2rem)] md:px-2",
          )}
        >
          <div className="flex min-w-0 flex-1 items-center min-[900px]:hidden">
            <MobileNav />
            <Link
              href={ROUTES.discover}
              prefetch={false}
              className="ml-1 rounded-full px-2 py-2 text-[0.72rem] font-semibold tracking-[0.22em] text-white focus-visible:ring-2 focus-visible:ring-white/55 focus-visible:outline-none"
              aria-label={`${APP_NAME} home`}
            >
              {APP_NAME.toUpperCase()}
            </Link>
            <div className="flex-1" aria-hidden />
            <SearchLink
              compact
              className={cn(
                styles.utility,
                "h-10 w-10 rounded-full bg-transparent ring-0 dark:bg-transparent",
                "hover:bg-white/[0.07] dark:hover:bg-white/[0.07]",
              )}
            />
            <Link
              href={ROUTES.watchlist}
              prefetch={false}
              aria-label="Watchlist"
              aria-current={watchlistActive ? "page" : undefined}
              className={cn(
                styles.utility,
                "grid h-10 w-10 place-items-center rounded-full text-white/60 transition-colors duration-[160ms]",
                "hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-white/55 focus-visible:outline-none",
                watchlistActive && "bg-white/[0.11] text-white",
              )}
            >
              <Bookmark className="size-[1.1rem]" aria-hidden />
            </Link>
            <UserMenu user={user} className={cn("ml-1", styles.avatar)} />
          </div>

          <nav
            className="hidden items-center gap-0.5 min-[900px]:flex lg:gap-1"
            aria-label="Main navigation"
          >
            <Link
              href={ROUTES.discover}
              prefetch={false}
              className={cn(
                styles.brand,
                "mr-1 inline-flex h-9 items-center rounded-full px-2.5 text-[0.65rem] font-semibold tracking-[0.18em] text-white/90 focus-visible:ring-2 focus-visible:ring-white/55 focus-visible:outline-none",
              )}
              aria-label={`${APP_NAME} home`}
            >
              {APP_NAME.toUpperCase()}
            </Link>

            {PRIMARY_NAV.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                title={item.title}
                icon={item.icon}
                active={isRouteActive(pathname, item.href)}
                animateIndicator={pointerNavigation}
              />
            ))}

            <span
              className="mx-1 h-5 w-px bg-white/[0.10] lg:mx-1.5 lg:h-6"
              aria-hidden
            />

            <SearchLink
              compact
              className={cn(
                styles.utility,
                "h-9 w-9 rounded-full bg-transparent ring-0 lg:h-10 lg:w-10 dark:bg-transparent",
                "hover:bg-white/[0.07] dark:hover:bg-white/[0.07]",
              )}
            />
            <Link
              href={ROUTES.watchlist}
              prefetch={false}
              aria-label="Watchlist"
              aria-current={watchlistActive ? "page" : undefined}
              className={cn(
                styles.utility,
                "grid h-9 w-9 place-items-center rounded-full text-white/60 transition-colors duration-[160ms] lg:h-10 lg:w-10",
                "hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-white/55 focus-visible:outline-none",
                watchlistActive && "bg-white/[0.11] text-white",
              )}
            >
              <Bookmark className="size-[1.1rem]" aria-hidden />
            </Link>
            <UserMenu user={user} className={cn("ml-1.5", styles.avatar)} />
          </nav>
        </div>
      </LayoutGroup>
    </header>
  );
}
