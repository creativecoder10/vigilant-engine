"use client";

import type { Source, Stats } from "@/types/finding";
import { SOURCE_LABEL, SOURCE_ORDER } from "@/lib/colors";
import { useUrlFilter } from "@/lib/navigation-pending";

/**
 * A dropdown filter (compact, so it doesn't push the findings table far down
 * the page on mobile). The per-scanner legend/links live in the page footer
 * instead - this section is purely the filter control.
 */
export function SourceBreakdown({ stats, activeSource }: { stats: Stats; activeSource: Source | null }) {
  const setParam = useUrlFilter();

  function setSource(next: Source | null) {
    setParam("source", next);
  }

  return (
    <section
      aria-label="Filter open findings by scanner"
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--ink-secondary)" }}>
        Open findings by scanner
      </h2>

      <div className="relative w-full sm:max-w-[33%]">
        <select
          aria-label="Filter findings by scanner"
          value={activeSource ?? "all"}
          onChange={(event) => setSource(event.target.value === "all" ? null : (event.target.value as Source))}
          className="w-full appearance-none rounded-md border py-2 pl-3 pr-9 text-sm"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
        >
          <option value="all">All scanners ({stats.total_open})</option>
          {SOURCE_ORDER.map((source) => (
            <option key={source} value={source}>
              {SOURCE_LABEL[source]} ({stats.by_source[source]})
            </option>
          ))}
        </select>
        {/* appearance-none hides the browser's own arrow (its position isn't
            controllable via padding) so this hand-drawn one can sit exactly
            where we want it, independent of the box's width. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="var(--ink-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </section>
  );
}
