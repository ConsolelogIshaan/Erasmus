"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { STUDIO_REGIONS, STUDIO_SORTS, type StudioFilters as Filters } from "../config";

export function StudioFilters({ slug, filters }: { slug: string; filters: Filters }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function href(key: string, value: string) {
    const params = new URLSearchParams({
      region: filters.region,
      type: filters.type,
      sort: filters.sort,
    });
    params.set(key, value);
    return `/studios/${slug}?${params}`;
  }
  function update(key: string, value: string) {
    startTransition(() => router.push(href(key, value), { scroll: false }));
  }
  return (
    <div className="border-border/50 flex flex-col gap-5 border-y py-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <nav
        aria-label="Content type"
        className="bg-muted/50 flex w-fit items-center gap-1 rounded-full p-1"
      >
        {(
          [
            { value: "movie", label: "Movies" },
            { value: "tv", label: "TV shows" },
          ] as const
        ).map((type) => (
          <Link
            key={type.value}
            prefetch={false}
            href={href("type", type.value)}
            aria-current={filters.type === type.value ? "page" : undefined}
            className={cn(
              "focus-visible:outline-ring rounded-full px-5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
              filters.type === type.value
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {type.label}
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-center gap-3">
        {pending ? (
          <Loader2
            className="text-muted-foreground size-4 animate-spin"
            aria-label="Updating catalog"
            role="status"
          />
        ) : null}
        <Select
          value={filters.region}
          onValueChange={(value) => update("region", value)}
          disabled={pending}
        >
          <SelectTrigger aria-label="Catalog region" className="w-[10.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STUDIO_REGIONS.map((region) => (
              <SelectItem key={region.code} value={region.code}>
                {region.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.sort}
          onValueChange={(value) => update("sort", value)}
          disabled={pending}
        >
          <SelectTrigger aria-label="Sort titles" className="w-[10.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STUDIO_SORTS.map((sort) => (
              <SelectItem key={sort.value} value={sort.value}>
                {sort.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
