"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function StudioCatalogError() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div
      className="border-border/60 bg-card/60 rounded-2xl border px-6 py-10"
      role="alert"
    >
      <h2 className="text-lg font-medium">Catalog temporarily unavailable</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        We couldn’t load this collection. Please try again in a moment.
      </p>
      <Button
        variant="outline"
        className="mt-5"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {pending ? "Loading…" : "Try again"}
      </Button>
    </div>
  );
}
