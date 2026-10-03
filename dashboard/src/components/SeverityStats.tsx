"use client";

import type { Severity, Stats } from "@/types/finding";
import { SEVERITY_COLOR, SEVERITY_ORDER } from "@/lib/colors";
import { useUrlFilter } from "@/lib/navigation-pending";

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
  const setParam = useUrlFilter();

  function setSeverity(next: Severity | null) {
    setParam("severity", next);
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
      className="rounded-lg border p-3 text-left transition-colors sm:p-4"
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
      <p className="mt-1 text-xl font-semibold tabular-nums sm:mt-2 sm:text-3xl">{count}</p>
    </button>
  );
}
