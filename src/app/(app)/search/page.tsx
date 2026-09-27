import type { Metadata } from "next";
import { SearchPage } from "@/features/search/components/search-page";

export const metadata: Metadata = { title: "Search" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  return <SearchPage initialQuery={q.slice(0, 120)} />;
}
