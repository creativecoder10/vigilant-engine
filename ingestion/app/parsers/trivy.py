"""Normalize ``trivy image -f json`` output into Finding rows.

Trivy is a container scanner: it inspects a *built Docker image's* OS
packages and language dependencies for known CVEs - a different surface
from source-level SCA (npm audit/Snyk only see what's declared in
package.json; Trivy sees what actually ended up installed in the image,
OS packages included). Its output is grouped by "Target" - one entry per
scanned layer or lockfile inside the image - each holding its own list of
vulnerabilities, so this parser flattens two levels of nesting instead of
one.
"""
from __future__ import annotations

from typing import Optional

from app.dedupe import compute_dedupe_hash
from app.models import Finding
from app.schema import Severity, Source

SEVERITY_MAP = {
    "CRITICAL": Severity.CRITICAL,
    "HIGH": Severity.HIGH,
    "MEDIUM": Severity.MEDIUM,
    "LOW": Severity.LOW,
    "UNKNOWN": Severity.INFO,
}


def parse(raw_output: dict, *, repo: str, branch: str = "main", commit_sha: Optional[str] = None) -> list[Finding]:
    """Turn one ``trivy image -f json`` payload into a list of Finding rows."""
    findings: list[Finding] = []
    for result in raw_output.get("Results", []):
        target = result.get("Target", "unknown-image")
        for vuln in result.get("Vulnerabilities", []):
            rule_id = vuln.get("VulnerabilityID", "unknown-cve")
            severity = SEVERITY_MAP.get(vuln.get("Severity", "UNKNOWN"), Severity.INFO)
            fixed_version = vuln.get("FixedVersion")

            findings.append(
                Finding(
                    dedupe_hash=compute_dedupe_hash(Source.TRIVY, repo, rule_id, vuln.get("PkgName"), target),
                    source=Source.TRIVY,
                    rule_id=rule_id,
                    title=vuln.get("Title", rule_id),
                    description=(vuln.get("Description") or "")[:1000],
                    severity=severity,
                    repo=repo,
                    branch=branch,
                    commit_sha=commit_sha,
                    file_path=target,
                    package_name=vuln.get("PkgName"),
                    package_version=vuln.get("InstalledVersion"),
                    remediation=f"Upgrade to {fixed_version}" if fixed_version else None,
                    raw=vuln,
                )
            )
    return findings
