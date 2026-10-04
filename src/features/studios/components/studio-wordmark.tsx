import Image from "next/image";
import { logoUrl } from "@/lib/media/image";
import type { Studio } from "../config";
import styles from "./studios.module.css";

export function StudioWordmark({
  studio,
  hero = false,
}: {
  studio: Studio;
  hero?: boolean;
}) {
  const wordmark = studio.slug !== "sonyliv";
  return (
    <Image
      src={wordmark ? `/studios/${studio.slug}.svg` : logoUrl(studio.logo, "w300")!}
      alt={studio.name}
      width={480}
      height={200}
      unoptimized={wordmark}
      priority={hero}
      loading={hero ? undefined : "eager"}
      sizes={hero ? "(max-width: 640px) 240px, 420px" : "(max-width: 640px) 120px, 180px"}
      className={`${hero ? styles.heroWordmark : styles.wordmark} ${wordmark && !["netflix", "hulu"].includes(studio.slug) ? styles.whiteWordmark : ""}`}
    />
  );
}
