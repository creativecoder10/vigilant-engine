"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Severity, Stats } from "@/types/finding";
import { SEVERITY_COLOR, SEVERITY_ORDER } from "@/lib/colors";

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

/**
 * Doubles as the severity summary and the severity filter: clicking a tile
 * sets ?severity=<x> (read server-side by the page to filter the findings
 * table below), clicking the active tile again - or "All" - clears it.
 */
export function SeverityStats({ stats, activeSeverity }: { stats: Stats; activeSeverity: Severity | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setSeverity(next: Severity | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set("severity", next);
    } else {
      params.delete("severity");
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <section aria-label="Filter open findings by severity" className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      <Tile
        label="All"
        count={stats.total_open}
        active={activeSeverity === null}
        color="var(--ink-muted)"
        onClick={() => setSeverity(null)}
      />
      {SEVERITY_ORDER.map((severity) => (
        <Tile
          key={severity}
          label={SEVERITY_LABEL[severity]}
          count={stats.by_severity[severity]}
          active={activeSeverity === severity}
          color={SEVERITY_COLOR[severity]}
          onClick={() => setSeverity(activeSeverity === severity ? null : severity)}
        />
      ))}
    </section>
  );
}

function Tile({
  label,
  count,
  active,
  color,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-lg border p-4 text-left transition-colors"
      style={{
        borderColor: active ? color : "var(--border)",
        backgroundColor: "var(--surface)",
        boxShadow: active ? `inset 0 0 0 1px ${color}` : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        {/* Color is a secondary accent, not the only signal - the text
            label is what actually names the severity/filter state. */}
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-sm font-medium" style={{ color: "var(--ink-secondary)" }}>
          {label}
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{count}</p>
    </button>
  );
}
