"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bookmark,
  Film,
  Heart,
  Home,
  Target,
  Tv,
  Users,
} from "lucide-react";

import { AnimeIcon } from "@/components/layout/anime-icon";
import { SearchLink } from "@/components/layout/search-link";
import { MobileNav } from "@/components/layout/mobile-nav";
import { UserMenu, type UserMenuUser } from "@/components/layout/user-menu";
import { APP_NAME } from "@/constants/app";
import { ROUTES } from "@/constants/routes";
import type { NavIcon } from "@/constants/navigation";
import { cn } from "@/lib/utils";

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
}

function NavLink({ href, title, icon: Icon, active }: NavLinkProps) {
  const reduceMotion = useReducedMotion();

  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex h-9 lg:h-10 items-center rounded-full px-2.5 lg:px-3.5 text-xs md:text-[0.84rem] lg:text-[0.9375rem] font-medium whitespace-nowrap",
        "transition-[background-color,color] duration-[180ms] ease-out",
        "focus-visible:ring-2 focus-visible:ring-white/55 focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none",
        active
          ? "bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] font-semibold"
          : "text-white/55 hover:bg-white/[0.055] hover:text-white/90",
      )}
    >
      <AnimatePresence initial={false}>
        {active ? (
          <motion.span
            key={`icon-${title}`}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.6, width: 0, marginRight: 0 }}
            animate={
              reduceMotion
                ? { opacity: 1, scale: 1, width: "auto" }
                : { opacity: 1, scale: 1, width: "auto", marginRight: 6 }
            }
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6, width: 0, marginRight: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center overflow-hidden text-current"
          >
            <Icon className="size-3.5 lg:size-4 shrink-0" aria-hidden="true" />
          </motion.span>
        ) : null}
      </AnimatePresence>
      <span>{title}</span>
    </Link>
  );
}

/** Persistent viewport-centered navigation for the authenticated application. */
export function ErasmusFloatingNavbar({ user }: { user: UserMenuUser }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const scrollRoot = document.getElementById("main-content");
    if (!scrollRoot) return;

    const update = () => setScrolled(scrollRoot.scrollTop > 24);
    update();
    scrollRoot.addEventListener("scroll", update, { passive: true });
    return () => scrollRoot.removeEventListener("scroll", update);
  }, [pathname]);

  const watchlistActive = isRouteActive(pathname, ROUTES.watchlist);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-3 z-40 px-3 md:top-5 md:px-4">
      <div
        data-scrolled={scrolled || undefined}
        className={cn(
          "pointer-events-auto mx-auto flex h-14 w-full items-center rounded-full border border-white/[0.09] px-2",
          "bg-[rgba(8,9,11,0.78)] shadow-[0_12px_40px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.05)]",
          "backdrop-blur-[18px] backdrop-saturate-[120%]",
          "transition-[background-color,height,box-shadow] duration-200 ease-out",
          "data-[scrolled]:bg-[rgba(8,9,11,0.92)] data-[scrolled]:shadow-[0_10px_34px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.055)]",
          "md:h-16 md:w-fit md:max-w-[calc(100vw-2rem)] md:px-2.5",
          "motion-reduce:transition-none",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center md:hidden">
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
              "grid h-10 w-10 place-items-center rounded-full text-white/60 transition-colors duration-[160ms]",
              "hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-white/55 focus-visible:outline-none",
              watchlistActive && "bg-white/[0.11] text-white",
            )}
          >
            <Bookmark className="size-[1.1rem]" aria-hidden />
          </Link>
          <UserMenu user={user} className="ml-0.5" />
        </div>

        <nav className="hidden items-center gap-0.5 lg:gap-1 md:flex" aria-label="Main navigation">
          <Link
            href={ROUTES.discover}
            prefetch={false}
            className="mr-1 inline-flex h-9 lg:h-10 items-center rounded-full px-2.5 lg:px-3 text-[0.72rem] font-semibold tracking-[0.22em] text-white transition-colors duration-[160ms] hover:bg-white/[0.055] focus-visible:ring-2 focus-visible:ring-white/55 focus-visible:outline-none"
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
            />
          ))}

          <span className="mx-1 lg:mx-1.5 h-5 lg:h-6 w-px bg-white/[0.10]" aria-hidden />

          <SearchLink
            compact
            className={cn(
              "h-9 w-9 lg:h-10 lg:w-10 rounded-full bg-transparent ring-0 dark:bg-transparent",
              "hover:bg-white/[0.07] dark:hover:bg-white/[0.07]",
            )}
          />
          <Link
            href={ROUTES.watchlist}
            prefetch={false}
            aria-label="Watchlist"
            aria-current={watchlistActive ? "page" : undefined}
            className={cn(
              "grid h-9 w-9 lg:h-10 lg:w-10 place-items-center rounded-full text-white/60 transition-colors duration-[160ms]",
              "hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-white/55 focus-visible:outline-none",
              watchlistActive && "bg-white/[0.11] text-white",
            )}
          >
            <Bookmark className="size-[1.1rem]" aria-hidden />
          </Link>
          <UserMenu user={user} className="ml-0.5" />
        </nav>
      </div>
    </header>
  );
}
