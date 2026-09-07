"""Normalize ``snyk test --json`` output into Finding rows.

Snyk is an SCA tool like npm audit, but checks against its own (broader)
vulnerability database and reports one entry per vulnerability instance
directly - no grouping-by-package indirection to unwrap, unlike npm audit's
``via`` list.
"""
from __future__ import annotations

from typing import Optional

from app.dedupe import compute_dedupe_hash
from app.models import Finding
from app.schema import Severity, Source

SEVERITY_MAP = {
    "critical": Severity.CRITICAL,
    "high": Severity.HIGH,
    "medium": Severity.MEDIUM,
    "low": Severity.LOW,
}


def parse(raw_output: dict, *, repo: str, branch: str = "main", commit_sha: Optional[str] = None) -> list[Finding]:
    """Turn one ``snyk test --json`` payload into a list of Finding rows."""
    findings: list[Finding] = []
    for vuln in raw_output.get("vulnerabilities", []):
        rule_id = vuln.get("id", "unknown-snyk-id")
        severity = SEVERITY_MAP.get(vuln.get("severity", "low"), Severity.LOW)
        fixed_in = vuln.get("fixedIn") or []
        remediation = f"Upgrade to {', '.join(fixed_in)}" if fixed_in else None

        findings.append(
            Finding(
                dedupe_hash=compute_dedupe_hash(Source.SNYK, repo, rule_id, vuln.get("packageName")),
                source=Source.SNYK,
                rule_id=rule_id,
                title=vuln.get("title", rule_id),
                description=(vuln.get("description") or "")[:1000],
                severity=severity,
                repo=repo,
                branch=branch,
                commit_sha=commit_sha,
                package_name=vuln.get("packageName"),
                package_version=vuln.get("version"),
                remediation=remediation,
                raw=vuln,
            )
        )
    return findings
