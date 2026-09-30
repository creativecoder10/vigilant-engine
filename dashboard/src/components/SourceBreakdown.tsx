"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Source, Stats } from "@/types/finding";
import { SOURCE_COLOR, SOURCE_LABEL, SOURCE_ORDER } from "@/lib/colors";

/**
 * Doubles as the per-scanner summary and the source filter, same pattern as
 * SeverityStats: clicking a row sets ?source=<x> (read server-side by the
 * page to filter the findings table below), clicking the active row again -
 * or "All" - clears it.
 */
export function SourceBreakdown({ stats, activeSource }: { stats: Stats; activeSource: Source | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const max = Math.max(1, ...SOURCE_ORDER.map((source) => stats.by_source[source]));

  function setSource(next: Source | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set("source", next);
    } else {
      params.delete("source");
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <section
      aria-label="Filter open findings by scanner"
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <h2 className="mb-4 text-sm font-medium" style={{ color: "var(--ink-secondary)" }}>
        Open findings by scanner
      </h2>
      <ul className="flex flex-col gap-2">
        <Row
          label="All"
          count={stats.total_open}
          widthPct={100}
          active={activeSource === null}
          color="var(--ink-muted)"
          onClick={() => setSource(null)}
        />
        {SOURCE_ORDER.map((source) => {
          const count = stats.by_source[source];
          return (
            <Row
              key={source}
              label={SOURCE_LABEL[source]}
              count={count}
              widthPct={(count / max) * 100}
              active={activeSource === source}
              color={SOURCE_COLOR[source]}
              onClick={() => setSource(activeSource === source ? null : source)}
            />
          );
        })}
      </ul>
    </section>
  );
}

function Row({
  label,
  count,
  widthPct,
  active,
  color,
  onClick,
}: {
  label: string;
  count: number;
  widthPct: number;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className="grid w-full grid-cols-[7rem_1fr_2.5rem] items-center gap-3 rounded-md p-1 text-left transition-colors"
        style={{
          boxShadow: active ? `inset 0 0 0 1px ${color}` : undefined,
        }}
      >
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate text-sm">{label}</span>
        </div>
        <div className="h-4 rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div
            className="h-4 rounded-full"
            style={{
              width: count > 0 ? `${widthPct}%` : 0,
              backgroundColor: color,
            }}
          />
        </div>
        <span className="text-right text-sm tabular-nums" style={{ color: "var(--ink-secondary)" }}>
          {count}
        </span>
      </button>
    </li>
  );
}
