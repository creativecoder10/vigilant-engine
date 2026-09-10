import type { Stats } from "@/types/finding";
import { SOURCE_COLOR, SOURCE_LABEL, SOURCE_ORDER } from "@/lib/colors";

export function SourceBreakdown({ stats }: { stats: Stats }) {
  const max = Math.max(1, ...SOURCE_ORDER.map((source) => stats.by_source[source]));

  return (
    <section
      aria-label="Open findings by scanner"
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <h2 className="mb-4 text-sm font-medium" style={{ color: "var(--ink-secondary)" }}>
        Open findings by scanner
      </h2>
      <ul className="flex flex-col gap-3">
        {SOURCE_ORDER.map((source) => {
          const count = stats.by_source[source];
          const widthPct = (count / max) * 100;
          return (
            <li key={source} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: SOURCE_COLOR[source] }}
                />
                <span className="truncate text-sm">{SOURCE_LABEL[source]}</span>
              </div>
              <div className="h-4 rounded-full" style={{ backgroundColor: "var(--border)" }}>
                <div
                  className="h-4 rounded-full"
                  style={{
                    width: count > 0 ? `${widthPct}%` : 0,
                    backgroundColor: SOURCE_COLOR[source],
                  }}
                />
              </div>
              <span className="text-right text-sm tabular-nums" style={{ color: "var(--ink-secondary)" }}>
                {count}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
