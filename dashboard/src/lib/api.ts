import type { Finding, FindingsFilter, Stats } from "@/types/finding";

// Server-side only - these run in Server Components, never shipped to the
// browser, so this doesn't need the NEXT_PUBLIC_ prefix. Defaults to the
// ingestion service's own local default port for development.
const INGESTION_API_URL = process.env.INGESTION_API_URL ?? "http://localhost:8000";

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${INGESTION_API_URL}${path}`, {
    // Findings change on every CI run, not on every dashboard request -
    // revalidate periodically rather than caching indefinitely or
    // refetching on every render.
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Ingestion API request to ${path} failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export function getFindings(filter: FindingsFilter = {}): Promise<Finding[]> {
  const params = new URLSearchParams();
  if (filter.severity) params.set("severity", filter.severity);
  if (filter.source) params.set("source", filter.source);
  if (filter.status) params.set("status", filter.status);
  if (filter.repo) params.set("repo", filter.repo);
  if (filter.limit) params.set("limit", String(filter.limit));

  const query = params.toString();
  return apiFetch<Finding[]>(`/findings${query ? `?${query}` : ""}`);
}

export function getStats(): Promise<Stats> {
  return apiFetch<Stats>("/stats");
}
