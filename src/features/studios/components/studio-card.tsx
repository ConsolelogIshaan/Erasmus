import Link from "next/link";
import type { Studio } from "../config";
import { StudioWordmark } from "./studio-wordmark";
import styles from "./studios.module.css";

export function StudioCard({ studio }: { studio: Studio }) {
  return (
    <Link
      href={`/studios/${studio.slug}`}
      prefetch={false}
      className={styles.card}
      aria-label={`Explore ${studio.name}`}
    >
      <StudioWordmark studio={studio} />
    </Link>
  );
}
