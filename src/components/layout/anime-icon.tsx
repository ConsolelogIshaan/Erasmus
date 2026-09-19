import * as React from "react";
import { cn } from "@/lib/utils";

export interface AnimeIconProps extends React.HTMLAttributes<HTMLSpanElement> {
  className?: string;
}

/**
 * Custom Anime navigation icon matching the user-provided asset.
 * Rendered using CSS mask so it seamlessly inherits currentColor,
 * matching Lucide icons for hover states (white), active states (primary glow),
 * and responsive sizing without altering the original shape.
 */
export const AnimeIcon = React.forwardRef<HTMLSpanElement, AnimeIconProps>(
  ({ className, style, ...props }, ref) => {
    return (
      <span
        ref={ref}
        role="img"
        aria-label="Anime"
        className={cn(
          "inline-block shrink-0 bg-current align-middle select-none",
          className
        )}
        style={{
          maskImage: "url(/icons/anime.png)",
          WebkitMaskImage: "url(/icons/anime.png)",
          maskSize: "contain",
          WebkitMaskSize: "contain",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskPosition: "center",
          WebkitMaskPosition: "center",
          ...style,
        }}
        {...props}
      />
    );
  }
);

AnimeIcon.displayName = "AnimeIcon";
