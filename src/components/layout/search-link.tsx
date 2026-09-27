"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils";

export function SearchLink({ className }: { className?: string; compact?: boolean }) {
  const active = usePathname() === ROUTES.search;
  return (
    <Link
      href={ROUTES.search}
      prefetch={false}
      aria-label="Search"
      aria-current={active ? "page" : undefined}
      className={cn(
        "grid h-10 w-10 place-items-center rounded-full text-white/60 hover:text-white focus-visible:ring-2 focus-visible:ring-white/55 focus-visible:outline-none",
        className,
        active && "bg-white/10 text-white",
      )}
    >
      <Search className="size-[1.1rem]" aria-hidden />
    </Link>
  );
}
