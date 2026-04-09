import { MarketsPageClient } from "./MarketsPageClient";

interface PageProps {
  searchParams?: Promise<{
    search?: string | string[] | undefined;
  }>;
}

export { MarketsPageClient };

export default async function MarketsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const searchValue = resolvedSearchParams.search;
  const initialSearch = Array.isArray(searchValue) ? searchValue[0] ?? "" : searchValue ?? "";

  return <MarketsPageClient initialSearch={initialSearch} />;
}
