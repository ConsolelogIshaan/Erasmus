import {
  Bookmark,
  Compass,
  Film,
  Heart,
  Home,
  LayoutDashboard,
  Settings,
  Sparkles,
  Target,
  Tv,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

import { ROUTES } from "./routes";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
  description?: string;
}

export const MAIN_NAV: readonly NavItem[] = [
  {
    title: "Home",
    href: ROUTES.dashboard,
    icon: LayoutDashboard,
    description: "Intelligence dashboard",
  },
  {
    title: "Discover",
    href: ROUTES.discover,
    icon: Compass,
    description: "Explore entertainment",
  },
  {
    title: "For You",
    href: ROUTES.recommendations,
    icon: Target,
    description: "Personalized recommendations",
  },
  {
    title: "Movies",
    href: ROUTES.movies,
    icon: Film,
    description: "Browse movies",
  },
  {
    title: "TV Shows",
    href: ROUTES.tv,
    icon: Tv,
    description: "Browse series",
  },
  {
    title: "Anime",
    href: ROUTES.anime,
    icon: Sparkles,
    description: "Browse anime",
  },
  {
    title: "Watchlist",
    href: ROUTES.watchlist,
    icon: Bookmark,
    description: "Plan to watch",
  },
  {
    title: "Favorites",
    href: ROUTES.favorites,
    icon: Heart,
    description: "Titles you love",
  },
  {
    title: "Friends",
    href: ROUTES.friends,
    icon: Users,
    description: "What friends are watching",
  },
] as const;

export const SECONDARY_NAV: readonly NavItem[] = [
  {
    title: "Profile",
    href: ROUTES.profile,
    icon: User,
    description: "Your profile",
  },
  {
    title: "Settings",
    href: ROUTES.settings,
    icon: Settings,
    description: "Preferences",
  },
] as const;

export const MARKETING_NAV: readonly NavItem[] = [
  {
    title: "Home",
    href: ROUTES.home,
    icon: Home,
  },
] as const;
