// Mirrors ingestion/app/schema.py and ingestion/app/models.py - kept in
// sync by hand, same tradeoff noted in Finding's own docstring: one shape,
// two languages, no shared codegen (yet).

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type FindingStatus = "open" | "triaged" | "fixed" | "ignored" | "false_positive";

export type Source = "semgrep" | "npm_audit" | "snyk" | "zap" | "gitleaks" | "trivy";

export interface Finding {
  id: number;
  dedupe_hash: string;
  source: Source;
  rule_id: string;
  title: string;
  description: string;
  severity: Severity;
  repo: string;
  branch: string;
  commit_sha: string | null;
  file_path: string | null;
  line_number: number | null;
  package_name: string | null;
  package_version: string | null;
  remediation: string | null;
  status: FindingStatus;
  first_seen: string;
  last_seen: string;
  raw: Record<string, unknown>;
}

export interface Stats {
  total_open: number;
  by_severity: Record<Severity, number>;
  by_source: Record<Source, number>;
}

export interface FindingsFilter {
  severity?: Severity;
  source?: Source;
  status?: FindingStatus;
  repo?: string;
  limit?: number;
}
