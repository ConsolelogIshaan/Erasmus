"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, ChevronDown } from "lucide-react";

import { SearchLink } from "@/components/layout/search-link";
import { MobileNav } from "@/components/layout/mobile-nav";
import { UserMenu, type UserMenuUser } from "@/components/layout/user-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MAIN_NAV } from "@/constants/navigation";
import { APP_NAME } from "@/constants/app";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils";

const PRIMARY_NAV = [
  { title: "Home", href: ROUTES.discover },
  { title: "TV Shows", href: ROUTES.tv },
  { title: "Movies", href: ROUTES.movies },
  { title: "Anime", href: ROUTES.anime },
] as const;

const MORE_ROUTES = new Set<string>([
  ROUTES.recommendations,
  ROUTES.favorites,
  ROUTES.friends,
]);

const MORE_NAV = MAIN_NAV.filter((item) => MORE_ROUTES.has(item.href));

function isRouteActive(pathname: string, href: string) {
  if (href === ROUTES.discover) return pathname === ROUTES.discover;
  if (href === ROUTES.movies) {
    return pathname === ROUTES.movies || pathname.startsWith("/movie/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  title,
  active,
}: {
  href: string;
  title: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-10 items-center rounded-full px-3.5 text-[0.9375rem] font-medium whitespace-nowrap",
        "transition-[background-color,color] duration-[160ms] ease-out",
        "focus-visible:ring-2 focus-visible:ring-white/55 focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none",
        active
          ? "bg-white/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]"
          : "text-white/55 hover:bg-white/[0.055] hover:text-white/90",
      )}
    >
      {title}
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

  const moreActive = MORE_NAV.some((item) => isRouteActive(pathname, item.href));
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

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          <Link
            href={ROUTES.discover}
            prefetch={false}
            className="mr-1 inline-flex h-10 items-center rounded-full px-3 text-[0.72rem] font-semibold tracking-[0.22em] text-white transition-colors duration-[160ms] hover:bg-white/[0.055] focus-visible:ring-2 focus-visible:ring-white/55 focus-visible:outline-none"
            aria-label={`${APP_NAME} home`}
          >
            {APP_NAME.toUpperCase()}
          </Link>

          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              title={item.title}
              active={isRouteActive(pathname, item.href)}
            />
          ))}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex h-10 items-center gap-1 rounded-full px-3 text-[0.9375rem] font-medium",
                  "transition-colors duration-[160ms] focus-visible:ring-2 focus-visible:ring-white/55 focus-visible:outline-none",
                  moreActive
                    ? "bg-white/[0.11] text-white"
                    : "text-white/55 hover:bg-white/[0.055] hover:text-white/90",
                )}
                aria-label="More destinations"
              >
                More
                <ChevronDown className="size-3.5" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-48">
              {MORE_NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link
                      href={item.href}
                      prefetch={false}
                      aria-current={
                        isRouteActive(pathname, item.href) ? "page" : undefined
                      }
                      className={cn(
                        isRouteActive(pathname, item.href) &&
                          "bg-white/[0.08] text-white",
                      )}
                    >
                      <Icon aria-hidden="true" />
                      {item.title}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="mx-1.5 h-6 w-px bg-white/[0.10]" aria-hidden />

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
        </nav>
      </div>
    </header>
  );
}
