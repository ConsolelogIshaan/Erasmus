"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Building2,
  Film,
  FolderOpen,
  Loader2,
  Play,
  Search,
  Star,
  TrendingUp,
  Tv,
  Users,
} from "lucide-react";

import { CommandItem } from "@/components/ui/command";
import { CommandMenu } from "@/components/unlumen-ui/command-menu";
import { useUI } from "@/providers/ui-provider";
import { posterUrl, profileUrl, logoUrl } from "@/lib/media/image";
import {
  getTvShowResume,
} from "@/lib/streaming/playback-progress";
import {
  pushRecentSearch,
  useMediaSearch,
} from "@/features/search/hooks/use-media-search";
import { recordSearchHistory } from "@/features/search/actions/search-history";
import { StreamingTheaterModal } from "@/features/streaming/components/streaming-theater-modal";
import type { SearchResultItem } from "@/types/media";
import { cn } from "@/lib/utils";

/**
 * Global spotlight search — Unlumen CommandMenu shell + Argus media results.
 * Unified cinematic discovery experience with centered play interaction and hover metadata.
 */
export function CommandPalette() {
  const router = useRouter();
  const { commandOpen, setCommandOpen } = useUI();
  const [query, setQuery] = React.useState("");
  const [playingMedia, setPlayingMedia] = React.useState<{
    title: string;
    tmdbId: string;
    mediaType: "movie" | "tv";
    posterPath?: string | null;
    releaseDate?: string | null;
    season?: number;
    episode?: number;
  } | null>(null);

  const { results, isLoading, isError, error, trending, isTrendingLoading } = useMediaSearch(
    query,
    commandOpen,
  );

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      setCommandOpen(open);
      if (!open) setQuery("");
    },
    [setCommandOpen],
  );

  const rememberQuery = React.useCallback((q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    pushRecentSearch(trimmed);
    void recordSearchHistory(trimmed);
  }, []);

  const run = React.useCallback(
    (fn: () => void) => {
      handleOpenChange(false);
      fn();
    },
    [handleOpenChange],
  );

  const go = React.useCallback(
    (href: string, searchQuery?: string) => {
      if (searchQuery) rememberQuery(searchQuery);
      run(() => router.push(href));
    },
    [rememberQuery, run, router],
  );

  const handlePlay = React.useCallback(
    (e: React.MouseEvent | React.KeyboardEvent, item: SearchResultItem) => {
      e.preventDefault();
      e.stopPropagation();
      if (item.kind !== "movie" && item.kind !== "tv") return;

      if (query.trim().length >= 2) {
        rememberQuery(query);
      }

      let season = 1;
      let episode = 1;
      if (item.kind === "tv") {
        const tvResume = getTvShowResume(String(item.id));
        if (tvResume) {
          season = tvResume.season;
          episode = tvResume.episode;
        }
      }

      // Close the search dialog so the theater modal has full focus
      handleOpenChange(false);
      setPlayingMedia({
        title: item.title,
        tmdbId: String(item.id),
        mediaType: item.kind,
        posterPath: item.imagePath,
        releaseDate: item.year,
        season,
        episode,
      });
    },
    [handleOpenChange, query, rememberQuery],
  );

  const showMedia = query.trim().length >= 1;

  return (
    <>
      <CommandMenu
        open={commandOpen}
        onOpenChange={handleOpenChange}
        hideTrigger
        bindShortcut={false}
        shouldFilter={false}
        placeholder="Search movies, shows, people, genres…"
        inputValue={query}
        onInputValueChange={setQuery}
        wide
      >
        {showMedia ? (
          <div className="flex flex-col py-2">
            {/* Header Bar */}
            <div className="flex items-center justify-between px-6 pt-3 pb-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Search Results
                </span>
                {results.length > 0 && !isLoading && (
                  <span className="text-xs text-muted-foreground/50">
                    ({results.length})
                  </span>
                )}
              </div>
              {isLoading ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>Searching…</span>
                </div>
              ) : null}
            </div>

            {/* Body: Loading / Error / Empty / Results Grid */}
            {isLoading && results.length === 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 px-6 pb-6 pt-1">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-full aspect-[2/3] border border-white/[0.06] bg-white/[0.03] animate-pulse !rounded-none flex flex-col justify-end p-3"
                  >
                    <div className="h-3 w-3/4 bg-white/10 !rounded-none mb-1.5" />
                    <div className="h-2.5 w-1/2 bg-white/10 !rounded-none" />
                  </div>
                ))}
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="h-10 w-10 !rounded-none border border-destructive/20 bg-destructive/10 flex items-center justify-center mb-3 text-destructive font-bold text-sm">
                  !
                </div>
                <h3 className="text-sm font-medium text-foreground">Search failed</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  {(error as Error)?.message ?? "An error occurred while searching. Please try again."}
                </p>
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <Film className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <h3 className="text-base font-medium text-foreground">No titles found</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Try a different title, person, or keyword.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 px-6 pb-6 pt-1">
                {results.map((item) => (
                  <PosterCard
                    key={`search-${item.kind}-${item.id}`}
                    item={item}
                    className="w-full"
                    onSelect={() => go(item.href, query)}
                    onPlay={(e) => handlePlay(e, item)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <SearchDiscoveryPanel
            trending={trending}
            isLoading={isTrendingLoading}
            onSelect={(item) => go(item.href)}
            onPlay={handlePlay}
          />
        )}
      </CommandMenu>

      {playingMedia ? (
        <StreamingTheaterModal
          open={Boolean(playingMedia)}
          onOpenChange={(open) => {
            if (!open) setPlayingMedia(null);
          }}
          title={playingMedia.title}
          tmdbId={playingMedia.tmdbId}
          mediaType={playingMedia.mediaType}
          currentSeason={playingMedia.season}
          currentEpisode={playingMedia.episode}
          identity={{
            provider: "tmdb",
            mediaType: playingMedia.mediaType,
            externalId: playingMedia.tmdbId,
            title: playingMedia.title,
            posterPath: playingMedia.posterPath,
            releaseDate: playingMedia.releaseDate,
          }}
        />
      ) : null}
    </>
  );
}

interface SearchDiscoveryPanelProps {
  trending: SearchResultItem[];
  isLoading: boolean;
  onSelect: (item: SearchResultItem) => void;
  onPlay: (e: React.MouseEvent | React.KeyboardEvent, item: SearchResultItem) => void;
}

function SearchDiscoveryPanel({
  trending,
  isLoading,
  onSelect,
  onPlay,
}: SearchDiscoveryPanelProps) {
  return (
    <div className="flex flex-col py-2">
      <div className="flex items-center justify-between px-6 pt-3 pb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Trending Today
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-3.5 overflow-hidden px-6 pb-6 pt-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="w-[140px] sm:w-[155px] md:w-[170px] aspect-[2/3] shrink-0 border border-white/[0.06] bg-white/[0.03] animate-pulse !rounded-none flex flex-col justify-end p-3"
            >
              <div className="h-3 w-3/4 bg-white/10 !rounded-none mb-1.5" />
              <div className="h-2.5 w-1/2 bg-white/10 !rounded-none" />
            </div>
          ))}
        </div>
      ) : trending.length === 0 ? (
        <div className="px-6 py-12 text-center text-xs text-muted-foreground">
          No trending titles available right now. Type above to search the full catalog.
        </div>
      ) : (
        <div
          className="flex items-center gap-3.5 overflow-x-auto px-6 pb-6 pt-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          tabIndex={-1}
        >
          {trending.map((item) => (
            <PosterCard
              key={`trend-${item.kind}-${item.id}`}
              item={item}
              className="shrink-0 w-[140px] sm:w-[155px] md:w-[170px]"
              onSelect={() => onSelect(item)}
              onPlay={(e) => onPlay(e, item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface PosterCardProps {
  item: SearchResultItem;
  onSelect: () => void;
  onPlay?: (e: React.MouseEvent | React.KeyboardEvent) => void;
  className?: string;
}

function PosterCard({
  item,
  onSelect,
  onPlay,
  className,
}: PosterCardProps) {
  const image =
    item.kind === "person"
      ? profileUrl(item.imagePath, "w185")
      : item.kind === "company"
        ? logoUrl(item.imagePath, "w300")
        : posterUrl(item.imagePath, "w342");

  const KindIcon =
    item.kind === "tv"
      ? Tv
      : item.kind === "person"
        ? Users
        : item.kind === "collection"
          ? FolderOpen
          : item.kind === "company"
            ? Building2
            : Film;

  const kindLabel =
    item.kind === "tv"
      ? "TV"
      : item.kind === "person"
        ? "Person"
        : item.kind === "collection"
          ? "Collection"
          : item.kind === "company"
            ? "Studio"
            : "Movie";

  const isPlayable = item.kind === "movie" || item.kind === "tv";
  const hasRating = typeof item.voteAverage === "number" && item.voteAverage > 0;
  const ratingText = hasRating ? item.voteAverage!.toFixed(1) : null;

  return (
    <CommandItem
      value={`${item.kind} ${item.title} ${item.year ?? ""} ${item.subtitle ?? ""}`}
      onSelect={onSelect}
      className={cn(
        "group relative flex flex-col aspect-[2/3] !rounded-none !p-0 cursor-pointer overflow-hidden",
        "border border-white/[0.08] bg-black/40",
        "transition-all duration-200",
        "hover:border-primary/70 hover:shadow-lg hover:shadow-primary/10",
        "!bg-transparent outline-none select-none",
        className,
      )}
    >
      <div className="relative w-full h-full overflow-hidden !rounded-none bg-muted/20">
        {/* Poster Image with subtle scale (1.00 -> 1.02) only on hover */}
        {image ? (
          <Image
            src={image}
            alt={item.title}
            fill
            sizes="(max-width: 640px) 140px, (max-width: 768px) 160px, 180px"
            className="object-cover !rounded-none transition-transform duration-300 ease-out group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/10 p-3 text-center text-muted-foreground !rounded-none">
            <KindIcon className="h-8 w-8 opacity-40" />
            <span className="text-[11px] font-medium text-muted-foreground/70 line-clamp-2">
              {item.title}
            </span>
          </div>
        )}

        {/* 1. Subtle Darkening Overlay (smooth 150-250ms) - ONLY ON HOVER */}
        <div
          className={cn(
            "absolute inset-0 bg-black/65 transition-opacity duration-200 pointer-events-none !rounded-none",
            "opacity-0 group-hover:opacity-100",
          )}
        />

        {/* Bottom vignette for text legibility - ONLY ON HOVER */}
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black via-black/70 to-transparent transition-opacity duration-200 pointer-events-none !rounded-none",
            "opacity-0 group-hover:opacity-100",
          )}
        />

        {/* Subtle top indicator line in Argus primary blue - ONLY ON HOVER */}
        <div
          className={cn(
            "absolute top-0 left-0 right-0 h-[2px] bg-primary transition-transform duration-200 origin-left pointer-events-none",
            "scale-x-0 group-hover:scale-x-100",
          )}
        />

        {/* 2. Centered Circular Play Button (Playable items only: Movie & TV) - ONLY ON HOVER */}
        {isPlayable && onPlay ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <button
              type="button"
              tabIndex={0}
              aria-label={`Play ${item.title}`}
              onClick={(e) => onPlay(e)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  onPlay(e);
                }
              }}
              className={cn(
                "pointer-events-auto cursor-pointer",
                "flex items-center justify-center",
                "size-11 sm:size-12 rounded-full",
                "bg-white text-black shadow-xl shadow-black/40",
                "transition-all duration-200 ease-out",
                /* Scale & Fade: 0.88 -> 1.0, opacity 0 -> 1 ONLY ON HOVER */
                "opacity-0 scale-[0.88] group-hover:opacity-100 group-hover:scale-100",
                /* Hover/Active states on the button itself */
                "hover:scale-105 hover:bg-white/95 active:scale-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              )}
            >
              <Play className="size-5 fill-black text-black ml-0.5" />
            </button>
          </div>
        ) : null}

        {/* 3. Bottom Metadata (Title, Rating with star, Year, Media kind) - ONLY ON HOVER */}
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 p-3 flex flex-col justify-end pointer-events-none z-10",
            "transition-all duration-200 ease-out",
            "translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100",
          )}
        >
          <span className="text-xs font-semibold text-white leading-snug line-clamp-2 drop-shadow-md">
            {item.title}
          </span>

          <div className="flex items-center gap-1.5 mt-1.5 text-[11px] font-medium text-zinc-300">
            {hasRating ? (
              <span className="flex items-center gap-0.5 text-primary font-bold">
                <Star className="size-3 fill-primary text-primary" />
                <span>{ratingText}</span>
              </span>
            ) : null}

            {hasRating && (item.year || kindLabel) ? (
              <span className="text-zinc-600">•</span>
            ) : null}

            <span className="uppercase tracking-wider text-[10px] text-zinc-400 font-semibold">
              {kindLabel}
            </span>

            {item.year ? (
              <>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400">{item.year}</span>
              </>
            ) : item.subtitle && !hasRating ? (
              <>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400 truncate">{item.subtitle}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </CommandItem>
  );
}
