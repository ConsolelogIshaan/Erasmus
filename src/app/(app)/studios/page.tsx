import type { Metadata } from "next";
import { StudioCard } from "@/features/studios/components/studio-card";
import { STUDIOS } from "@/features/studios/config";

export const metadata: Metadata = {
  title: "Studios",
  description: "Browse movie and TV catalogs from nine streaming services on Erasmus.",
};

export default function StudiosPage() {
  return (
    <div className="mx-auto max-w-6xl pb-8 sm:pt-6 lg:pt-10">
      <h1 className="sr-only">Studios</h1>
      <section
        aria-label="Streaming services"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5"
      >
        {STUDIOS.map((studio) => (
          <StudioCard key={studio.slug} studio={studio} />
        ))}
      </section>
    </div>
  );
}
