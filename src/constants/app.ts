/**
 * Application-level constants.
 */
export const APP_NAME = "Erasmus";
export const APP_TAGLINE = "See everything you watch";
export const APP_DESCRIPTION =
  "Every film and series you have watched, are watching, and keep meaning to start. All in one place, with your ratings and notes attached.";

/** Default metadata for SEO and social sharing. */
export const APP_METADATA = {
  name: APP_NAME,
  tagline: APP_TAGLINE,
  description: APP_DESCRIPTION,
  locale: "en_US",
} as const;

/** Layout measurements (mirrored in CSS variables). */
export const LAYOUT = {
  headerHeight: 56,
  sidebarWidth: 260,
  sidebarCollapsedWidth: 64,
  contentMaxWidth: 1440,
} as const;

/** Local storage keys for client-persisted preferences. */
export const STORAGE_KEYS = {
  sidebarCollapsed: "erasmus:sidebar-collapsed",
  commandRecent: "erasmus:command-recent",
  animationIntensity: "erasmus:animation-intensity",
  posterDensity: "erasmus:poster-density",
  pinnedSearches: "erasmus:pinned-searches",
} as const;
