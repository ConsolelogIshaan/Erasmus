"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { MAIN_NAV, SECONDARY_NAV, type NavItem } from "@/constants/navigation";
import { LAYOUT } from "@/constants/app";
import { useUI } from "@/providers/ui-provider";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function isNavActive(pathname: string, href: string, comingSoon?: boolean) {
  if (comingSoon) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface NavRowProps {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}

/**
 * One liquid glass rail row with frosted sheen, glowing active liquid capsule, and micro-fluid interactions.
 */
function NavRow({ item, active, collapsed }: NavRowProps) {
  const comingSoon = Boolean(item.comingSoon);
  const Icon = item.icon;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <Link
          href={comingSoon ? "#" : item.href}
          aria-current={active ? "page" : undefined}
          onClick={(event) => {
            if (comingSoon) event.preventDefault();
          }}
          className={cn(
            "group/row relative flex h-9 w-full items-center overflow-hidden rounded-lg border text-sm font-medium transition-all duration-200",
            active
              ? "border-white/[0.18] bg-gradient-to-r from-white/[0.14] to-white/[0.06] text-white shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.25),inset_0_0_12px_rgba(255,255,255,0.03),0_4px_16px_rgba(0,0,0,0.4)] backdrop-blur-xl"
              : "border-transparent text-muted-foreground/90 hover:border-white/[0.09] hover:bg-white/[0.07] hover:text-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
            comingSoon && "cursor-not-allowed opacity-50",
          )}
        >
          <span className="grid w-10 shrink-0 place-items-center">
            <Icon
              className={cn(
                "size-[1.05rem] transition-all duration-200 group-hover/row:scale-110",
                active
                  ? "text-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.75)]"
                  : "group-hover/row:text-white"
              )}
              aria-hidden
            />
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate pr-3 text-left tracking-wide",
              active ? "font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" : "",
              "transition-opacity delay-[90ms] duration-[120ms] ease-[var(--ease-out)]",
              "group-data-[collapsed]/rail:opacity-0",
              "group-data-[collapsed]/rail:delay-0",
              "group-data-[collapsed]/rail:duration-[80ms]",
              "motion-reduce:delay-0",
            )}
          >
            {item.title}
          </span>
        </Link>
      </TooltipTrigger>
      {collapsed ? (
        <TooltipContent side="right">{item.title}</TooltipContent>
      ) : null}
    </Tooltip>
  );
}

function NavList({
  items,
  label,
  collapsed,
  pathname,
}: {
  items: readonly NavItem[];
  label: string;
  collapsed: boolean;
  pathname: string;
}) {
  return (
    <nav className="flex flex-col gap-1" aria-label={label}>
      {items.map((item) => (
        <NavRow
          key={item.href}
          item={item}
          collapsed={collapsed}
          active={isNavActive(pathname, item.href, item.comingSoon)}
        />
      ))}
    </nav>
  );
}

/**
 * Desktop navigation — an elegant, seamless translucent liquid glass rail.
 * Features multi-layered optical refraction, specular edge highlights, and fluid micro-sheens.
 */
export function Sidebar({ isFullBleed }: { isFullBleed?: boolean }) {
  const pathname = usePathname();
  const { sidebarCollapsed, setSidebarCollapsed } = useUI();

  return (
    <aside
      data-collapsed={sidebarCollapsed || undefined}
      aria-label="Main navigation"
      className={cn(
        "group/rail hidden h-dvh shrink-0 flex-col overflow-hidden transition-all duration-300 md:flex",
        // Liquid glass backdrop: heavy optical refraction, crystalline blur, and luminous translucent depth
        "backdrop-blur-3xl backdrop-saturate-[190%] backdrop-contrast-[105%]",
        isFullBleed
          ? "fixed top-0 left-0 z-50 bg-[#03060c]/42 shadow-[6px_0_40px_rgba(0,0,0,0.4)] border-r border-white/[0.10]"
          : "sticky top-0 z-40 bg-[#040710]/52 shadow-[4px_0_30px_rgba(0,0,0,0.3)] border-r border-white/[0.08]",
        "transition-[width] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
        "motion-reduce:transition-none",
      )}
      style={{
        width: sidebarCollapsed
          ? LAYOUT.sidebarCollapsedWidth
          : LAYOUT.sidebarWidth,
        boxShadow:
          "inset -1px 0 0 0 rgba(255, 255, 255, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.06), inset 1px 0 0 0 rgba(255, 255, 255, 0.02), 8px 0 32px -4px rgba(0, 0, 0, 0.4)",
      }}
    >
      {/* 1. Base Liquid Glass Surface: Ambient diagonal refraction */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.04] via-transparent to-black/20"
        aria-hidden
      />

      {/* 2. Top Specular Meniscus / Water Sheen */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-white/[0.09] via-white/[0.02] to-transparent"
        aria-hidden
      />
      
      {/* 3. Subtle Liquid Caustic Blooms (Organic color refraction) */}
      <div
        className="pointer-events-none absolute -top-12 -left-10 h-48 w-48 rounded-full bg-cyan-400/[0.04] blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-1/3 -right-12 h-52 w-52 rounded-full bg-blue-500/[0.03] blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-28 -left-8 h-44 w-44 rounded-full bg-indigo-500/[0.025] blur-3xl"
        aria-hidden
      />

      {/* 4. Refractive Specular Right Edge Highlight (Polished crystal edge) */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-white/30 via-white/10 to-transparent"
        aria-hidden
      />

      <div className="relative z-10 flex h-[var(--header-height)] shrink-0 items-center px-3">
        <span className="grid w-10 place-items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7 rounded-full border border-white/[0.14] bg-white/[0.05] text-muted-foreground hover:bg-white/[0.12] hover:text-white hover:border-white/[0.28] backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_2px_8px_rgba(0,0,0,0.3)] transition-all duration-200"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? "Expand menu" : "Collapse menu"}
            aria-expanded={!sidebarCollapsed}
          >
            <ChevronsLeft
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                "duration-[var(--duration-fast)] ease-[var(--ease-out)]",
                "group-data-[collapsed]/rail:rotate-180",
                "motion-reduce:transition-none",
              )}
              aria-hidden
            />
          </Button>
        </span>
      </div>

      <div className="no-scrollbar relative z-10 flex-1 overflow-y-auto px-3 pb-4">
        <NavList
          items={MAIN_NAV}
          label="Primary"
          collapsed={sidebarCollapsed}
          pathname={pathname}
        />

        <div className="my-3 h-px w-full bg-gradient-to-r from-transparent via-white/[0.14] to-transparent" aria-hidden />

        <NavList
          items={SECONDARY_NAV}
          label="Secondary"
          collapsed={sidebarCollapsed}
          pathname={pathname}
        />
      </div>
    </aside>
  );
}
