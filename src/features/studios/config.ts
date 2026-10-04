export const STUDIO_REGIONS = [
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
] as const;

export const STUDIO_SORTS = [
  { value: "popular", label: "Popular now" },
  { value: "newest", label: "Newest releases" },
  { value: "rating", label: "Top rated" },
] as const;

export interface Studio {
  slug: string;
  name: string;
  description: string;
  color: string;
  logo: string;
  defaultRegion: string;
  providerIds: readonly number[];
}

// Direct service plans only: exclude unrelated rental stores and add-on channels.
// IDs and logo paths checked against TMDB's regional provider directory.
export const STUDIOS: readonly Studio[] = [
  {
    slug: "netflix",
    name: "Netflix",
    description: "Films, series, and stories from around the world.",
    color: "#e50914",
    logo: "/rK1KljqmbvO9HQa1PBFLILWah72.png",
    defaultRegion: "IN",
    providerIds: [8, 175, 1796],
  },
  {
    slug: "prime-video",
    name: "Prime Video",
    description: "Big-screen favorites and series worth settling into.",
    color: "#38bdf8",
    logo: "/gMZdpavHmxFNnLpMHwVxfqeux2g.png",
    defaultRegion: "IN",
    providerIds: [9, 119, 2100, 613],
  },
  {
    slug: "disney-plus",
    name: "Disney+",
    description: "Disney, Pixar, Marvel, Star Wars, and National Geographic.",
    color: "#02d6e8",
    logo: "/5eZ872CghnHFLB1j8grszbrx0dx.png",
    defaultRegion: "US",
    providerIds: [337],
  },
  {
    slug: "hbo-max",
    name: "HBO Max",
    description: "Prestige television, cinema, and unforgettable stories.",
    color: "#869bff",
    logo: "/skypuy7SXuugIQeYg0IglmzoKaS.png",
    defaultRegion: "US",
    providerIds: [1899, 384],
  },
  {
    slug: "hulu",
    name: "Hulu",
    description: "Discover your next series and your next movie night.",
    color: "#1ce783",
    logo: "/44uAnmSqvA4yBOdbPWN8YgQHjWm.png",
    defaultRegion: "US",
    providerIds: [15],
  },
  {
    slug: "apple-tv",
    name: "Apple TV",
    description: "A collection of distinctive films and original series.",
    color: "#d4d4d8",
    logo: "/9icYBfYFcwgCbky5VdGUIKJ4C5i.png",
    defaultRegion: "IN",
    providerIds: [350],
  },
  {
    slug: "paramount-plus",
    name: "Paramount+",
    description: "Explore films, familiar favorites, and new discoveries.",
    color: "#719fff",
    logo: "/4N4BMd0Mm0kHAmF7RZgL5lW3cwc.png",
    defaultRegion: "US",
    providerIds: [531, 2303, 2616],
  },
  {
    slug: "peacock",
    name: "Peacock",
    description: "Fresh series, movie favorites, and a little of everything.",
    color: "#facc15",
    logo: "/a1UIdq5BrkcAxnxcUhFsNbXnxeu.png",
    defaultRegion: "US",
    providerIds: [386, 387],
  },
  {
    slug: "sonyliv",
    name: "SonyLIV",
    description: "Indian cinema, television, and stories closer to home.",
    color: "#f59e0b",
    logo: "/coM4QWbmIOa0xJ5cGR9BRmoV25B.png",
    defaultRegion: "IN",
    providerIds: [237],
  },
];

export function getStudio(slug: string) {
  return STUDIOS.find((studio) => studio.slug === slug);
}

export type StudioSort = (typeof STUDIO_SORTS)[number]["value"];

export interface StudioFilters {
  region: string;
  type: "movie" | "tv";
  sort: StudioSort;
  page: number;
}

export function parseStudioFilters(
  params: Record<string, string | string[] | undefined>,
  studio: Studio,
): StudioFilters {
  const requestedPage = typeof params.page === "string" ? Number(params.page) : 1;
  return {
    region: STUDIO_REGIONS.some((region) => region.code === params.region)
      ? (params.region as string)
      : studio.defaultRegion,
    type: params.type === "tv" ? "tv" : "movie",
    sort: STUDIO_SORTS.some((sort) => sort.value === params.sort)
      ? (params.sort as StudioSort)
      : "popular",
    page: Number.isInteger(requestedPage) ? Math.min(500, Math.max(1, requestedPage)) : 1,
  };
}
