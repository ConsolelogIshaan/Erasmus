"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import { bostone } from "@/lib/fonts/bostone";
import { APP_NAME } from "@/constants/app";
import { ROUTES } from "@/constants/routes";

interface LogoProps {
  href?: string;
  className?: string;
  /** When true, renders icon mark only (no wordmark). */
  iconOnly?: boolean;
}

/**
 * Erasmus brand mark — 3D orbit icon + Bostone wordmark.
 * Default: icon + wordmark side-by-side.
 * iconOnly: just the mark (collapsed sidebar, mobile etc.).
 */
export function Logo({ href = ROUTES.home, className, iconOnly = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <Link
        href={href}
        className="group relative inline-flex items-center gap-2.5 outline-none"
        aria-label={`${APP_NAME} home`}
      >
        {/* Icon mark */}
        <span className="relative flex shrink-0 items-center justify-center">
          <img
            src="/erasmus-mark.png"
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            className={cn(
              "select-none object-contain transition-[filter,transform] duration-300 ease-out",
              "group-hover:scale-110 group-hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.55)]",
              "group-focus-visible:scale-110",
              iconOnly ? "h-7 w-7" : "h-8 w-8",
            )}
          />
        </span>

        {/* Wordmark */}
        {!iconOnly && (
          <span className="relative">
            <span
              className={cn(
                bostone.className,
                "relative text-[1.45rem] leading-none tracking-[-0.02em] text-foreground",
              )}
            >
              {APP_NAME.toUpperCase()}
            </span>
            {/* Animated underline on hover */}
            <span
              className={cn(
                "absolute -bottom-1.5 left-0 h-px w-full origin-left scale-x-0 bg-primary",
                "transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
                "group-hover:scale-x-100 group-focus-visible:scale-x-100",
                "motion-reduce:transition-none motion-reduce:group-hover:scale-x-0",
              )}
              aria-hidden="true"
            />
          </span>
        )}
      </Link>
    </span>
  );
}
