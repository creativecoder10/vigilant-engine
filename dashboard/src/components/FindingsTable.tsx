"use client";

import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 20;
import type { Finding, Severity, Source } from "@/types/finding";
import { SEVERITY_COLOR, SEVERITY_ORDER, SOURCE_COLOR, SOURCE_LABEL, SOURCE_ORDER } from "@/lib/colors";
import { useUrlFilter } from "@/lib/navigation-pending";

function formatDate(iso: string): string {
  // Explicit locale, not `undefined` - this now runs as both a server
  // render (Node's locale) and a client hydration (the browser's locale),
  // and those can disagree (e.g. "3 Oct 2026" vs "Oct 3, 2026"), which
  // React flags as a hydration mismatch. Pinning "en-US" keeps both sides
  // identical regardless of the visitor's OS/browser locale.
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const inputStyle = {
  borderColor: "var(--border)",
  backgroundColor: "var(--background)",
  color: "var(--foreground)",
} as const;

// A funnel, not a chevron - a chevron reads as "this opens a dropdown,"
// which isn't what's happening here (the panel below is a form, not a list
// of options to pick one from).
function FilterIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
      {label}
      {children}
    </label>
  );
}

export function FindingsTable({
  findings,
  activeSeverity,
  activeSource,
}: {
  findings: Finding[];
  activeSeverity: Severity | null;
  activeSource: Source | null;
}) {
  const setParam = useUrlFilter();
  const [panelOpen, setPanelOpen] = useState(false);

  // Severity/source go through the same URL filter as the cards/dropdown
  // above (so all three stay in sync); Finding/Location/Last seen are
  // plain client-side filters over the rows already loaded on this page -
  // they don't re-query the API, so they only narrow what's already here.
  const [findingQuery, setFindingQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [sinceDate, setSinceDate] = useState("");
  const [untilDate, setUntilDate] = useState("");

  const activeCount =
    (activeSeverity ? 1 : 0) +
    (activeSource ? 1 : 0) +
    (findingQuery ? 1 : 0) +
    (locationQuery ? 1 : 0) +
    (sinceDate ? 1 : 0) +
    (untilDate ? 1 : 0);

  const filtered = useMemo(() => {
    const findingNeedle = findingQuery.trim().toLowerCase();
    const locationNeedle = locationQuery.trim().toLowerCase();

    return findings.filter((finding) => {
      if (findingNeedle) {
        const haystack = `${finding.title} ${finding.rule_id}`.toLowerCase();
        if (!haystack.includes(findingNeedle)) return false;
      }
      if (locationNeedle) {
        const haystack = `${finding.file_path ?? ""} ${finding.package_name ?? ""}`.toLowerCase();
        if (!haystack.includes(locationNeedle)) return false;
      }
      const seenDate = finding.last_seen.slice(0, 10);
      if (sinceDate && seenDate < sinceDate) return false;
      if (untilDate && seenDate > untilDate) return false;
      return true;
    });
  }, [findings, findingQuery, locationQuery, sinceDate, untilDate]);

  // Resets to the first page whenever any filter narrows/widens the result
  // set - otherwise "visibleCount" could sit past the new filtered.length
  // (nothing renders) or hide rows that would now fit on the first page.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeSeverity, activeSource, findingQuery, locationQuery, sinceDate, untilDate]);

  const visibleRows = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visibleRows.length;

  function clearAllFilters() {
    setParam("severity", null);
    setParam("source", null);
    setFindingQuery("");
    setLocationQuery("");
    setSinceDate("");
    setUntilDate("");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          aria-expanded={panelOpen}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            borderColor: panelOpen ? "var(--ink-secondary)" : "var(--border)",
            backgroundColor: "var(--surface)",
            color: "var(--foreground)",
          }}
        >
          <FilterIcon />
          Filters
          {activeCount > 0 ? (
            <span
              className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
              style={{ backgroundColor: "var(--ink-secondary)", color: "var(--background)" }}
            >
              {activeCount}
            </span>
          ) : null}
        </button>

        {activeCount > 0 ? (
          <button type="button" onClick={clearAllFilters} className="text-xs underline underline-offset-2" style={{ color: "var(--ink-muted)" }}>
            Clear all filters
          </button>
        ) : null}

        <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
          Showing {visibleRows.length} of {filtered.length} matching findings
          {filtered.length !== findings.length ? ` (${findings.length} loaded)` : ""}.
        </p>
      </div>

      {panelOpen ? (
        <div
          className="grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <FilterField label="Severity">
            <select
              aria-label="Filter by severity"
              value={activeSeverity ?? "all"}
              onChange={(event) => setParam("severity", event.target.value === "all" ? null : event.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm"
              style={inputStyle}
            >
              <option value="all">All severities</option>
              {SEVERITY_ORDER.map((severity) => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Source">
            <select
              aria-label="Filter by source"
              value={activeSource ?? "all"}
              onChange={(event) => setParam("source", event.target.value === "all" ? null : event.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm"
              style={inputStyle}
            >
              <option value="all">All scanners</option>
              {SOURCE_ORDER.map((source) => (
                <option key={source} value={source}>
                  {SOURCE_LABEL[source]}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Finding">
            <input
              type="text"
              aria-label="Search finding title or rule ID"
              placeholder="Search title/rule..."
              value={findingQuery}
              onChange={(event) => setFindingQuery(event.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm"
              style={inputStyle}
            />
          </FilterField>

          <FilterField label="Location">
            <input
              type="text"
              aria-label="Search location or package"
              placeholder="Search path/package..."
              value={locationQuery}
              onChange={(event) => setLocationQuery(event.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm"
              style={inputStyle}
            />
          </FilterField>

          <FilterField label="Last seen from">
            <input
              type="date"
              aria-label="Last seen from"
              value={sinceDate}
              onChange={(event) => setSinceDate(event.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm"
              style={inputStyle}
            />
          </FilterField>

          <FilterField label="Last seen until">
            <input
              type="date"
              aria-label="Last seen until"
              value={untilDate}
              onChange={(event) => setUntilDate(event.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm"
              style={inputStyle}
            />
          </FilterField>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
              <th className="px-4 py-3 font-medium" style={{ color: "var(--ink-secondary)" }}>Severity</th>
              <th className="px-4 py-3 font-medium" style={{ color: "var(--ink-secondary)" }}>Source</th>
              <th className="px-4 py-3 font-medium" style={{ color: "var(--ink-secondary)" }}>Finding</th>
              <th className="px-4 py-3 font-medium" style={{ color: "var(--ink-secondary)" }}>Location</th>
              <th className="px-4 py-3 font-medium" style={{ color: "var(--ink-secondary)" }}>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-sm" style={{ color: "var(--ink-muted)" }}>
                  No findings match the current filters.
                </td>
              </tr>
            ) : (
              visibleRows.map((finding) => (
                <tr key={finding.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 capitalize">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: SEVERITY_COLOR[finding.severity] }}
                      />
                      {finding.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: SOURCE_COLOR[finding.source] }}
                      />
                      {SOURCE_LABEL[finding.source]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{finding.title}</p>
                    <p className="text-xs" style={{ color: "var(--ink-muted)" }}>{finding.rule_id}</p>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--ink-secondary)" }}>
                    {finding.file_path ?? finding.package_name ?? "—"}
                    {finding.line_number != null ? `:${finding.line_number}` : ""}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "var(--ink-muted)" }}>
                    {formatDate(finding.last_seen)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {remaining > 0 ? (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          className="self-center rounded-md border px-4 py-2 text-sm font-medium"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--foreground)" }}
        >
          Load {Math.min(PAGE_SIZE, remaining)} more ({remaining} remaining)
        </button>
      ) : null}
    </div>
  );
}
