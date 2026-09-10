import type { Severity, Source } from "@/types/finding";

// Status palette (fixed, never cycled) - severity is a state, not an
// identity, so it borrows the status ramp. "info" isn't a health/status
// level in the same sense as the other four, so it falls back to muted ink
// rather than being forced into the four-step ramp.
export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "var(--status-critical)",
  high: "var(--status-serious)",
  medium: "var(--status-warning)",
  low: "var(--status-good)",
  info: "var(--ink-muted)",
};

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

// Categorical palette, fixed order - one slot per scanner, never reassigned
// by count or alphabetically, so a source keeps its color across filters.
export const SOURCE_COLOR: Record<Source, string> = {
  semgrep: "var(--cat-1-blue)",
  npm_audit: "var(--cat-2-orange)",
  snyk: "var(--cat-3-aqua)",
  zap: "var(--cat-4-yellow)",
  gitleaks: "var(--cat-5-magenta)",
  trivy: "var(--cat-6-green)",
};

export const SOURCE_ORDER: Source[] = ["semgrep", "npm_audit", "snyk", "zap", "gitleaks", "trivy"];

export const SOURCE_LABEL: Record<Source, string> = {
  semgrep: "Semgrep",
  npm_audit: "npm audit",
  snyk: "Snyk",
  zap: "ZAP",
  gitleaks: "gitleaks",
  trivy: "Trivy",
};
