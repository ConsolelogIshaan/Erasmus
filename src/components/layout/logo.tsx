"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import { APP_NAME } from "@/constants/app";
import { ROUTES } from "@/constants/routes";

interface LogoProps {
  href?: string;
  className?: string;
  /** Retained for backwards compatibility */
  iconOnly?: boolean;
}

/**
 * Brand Logo — renders the transparent 3D orbit brand icon mark.
 * Features true alpha transparency, organic contour glow on hover, and responsive sizing.
 */
export function Logo({ href = ROUTES.dashboard, className }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <Link
        href={href}
        className="group relative inline-flex items-center outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
        aria-label={`${APP_NAME} home`}
      >
        <span className="relative flex shrink-0 items-center justify-center">
          <img
            src="/erasmus-mark.png"
            alt={APP_NAME}
            aria-hidden="true"
            width={52}
            height={40}
            className={cn(
              "h-8 sm:h-9 md:h-[38px] w-auto select-none object-contain transition-[filter,transform] duration-300 ease-out",
              "group-hover:scale-105 group-hover:drop-shadow-[0_0_12px_rgba(255,255,255,0.75)]",
              "group-focus-visible:scale-105 group-focus-visible:drop-shadow-[0_0_12px_rgba(255,255,255,0.75)]"
            )}
          />
        </span>
      </Link>
    </span>
  );
}
