import type { StreamingAvailability } from "@/types/media";

interface StreamingProvidersProps {
  availability?: StreamingAvailability | null;
  className?: string;
  /** Compact chips for hero / inline placement */
  compact?: boolean;
}

/**
 * StreamingProviders disabled: Erasmus is a self-contained streaming platform,
 * so external third-party provider offers ("Available on Netflix/Prime") are not displayed.
 */
export function StreamingProviders(_props?: StreamingProvidersProps) {
  return null;
}
