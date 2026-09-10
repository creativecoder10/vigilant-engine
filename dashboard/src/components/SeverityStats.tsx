import type { Stats } from "@/types/finding";
import { SEVERITY_COLOR, SEVERITY_ORDER } from "@/lib/colors";

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

export function SeverityStats({ stats }: { stats: Stats }) {
  return (
    <section aria-label="Open findings by severity" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {SEVERITY_ORDER.map((severity) => (
        <div
          key={severity}
          className="rounded-lg border p-4"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <div className="flex items-center gap-2">
            {/* Color is a secondary accent here, not the only signal - the
                text label below is what actually names the severity. */}
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: SEVERITY_COLOR[severity] }}
            />
            <span className="text-sm font-medium" style={{ color: "var(--ink-secondary)" }}>
              {SEVERITY_LABEL[severity]}
            </span>
          </div>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{stats.by_severity[severity]}</p>
        </div>
      ))}
    </section>
  );
}
