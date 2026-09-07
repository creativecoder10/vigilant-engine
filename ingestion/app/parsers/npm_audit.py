"""Normalize ``npm audit --json`` output into Finding rows.

npm audit is an SCA tool: it checks ``package.json``/``package-lock.json``
dependencies against the GitHub Advisory Database. Its report groups
findings by *package*, not by individual advisory - ``vulnerabilities`` is a
dict keyed by package name, and each package's ``via`` list holds either
advisory objects or plain package-name strings (when the vulnerability is
only inherited transitively, through another dependency). This parser only
reads the advisory objects for title/description, since a bare string just
means "vulnerable because of a dependency of this dependency" and adds no
new information for the finding itself.
"""
from __future__ import annotations

from typing import Optional

from app.dedupe import compute_dedupe_hash
from app.models import Finding
from app.schema import Severity, Source

SEVERITY_MAP = {
    "critical": Severity.CRITICAL,
    "high": Severity.HIGH,
    "moderate": Severity.MEDIUM,
    "low": Severity.LOW,
    "info": Severity.INFO,
}


def parse(raw_output: dict, *, repo: str, branch: str = "main", commit_sha: Optional[str] = None) -> list[Finding]:
    """Turn one ``npm audit --json`` payload into a list of Finding rows."""
    findings: list[Finding] = []
    for package_name, vuln in raw_output.get("vulnerabilities", {}).items():
        severity = SEVERITY_MAP.get(vuln.get("severity", "info"), Severity.INFO)
        advisories = [v for v in vuln.get("via", []) if isinstance(v, dict)]
        advisory = advisories[0] if advisories else {}

        rule_id = str(advisory.get("source", package_name))
        title = advisory.get("title") or f"Vulnerable dependency: {package_name}"
        url = advisory.get("url")

        description = f"Affects installed range {vuln.get('range', 'unknown')}."
        if url:
            description += f" Advisory: {url}"

        fix_available = vuln.get("fixAvailable")
        if fix_available is False:
            remediation = "No automatic fix available yet; upgrade manually or find an alternative package."
        else:
            remediation = "Run `npm audit fix`."

        findings.append(
            Finding(
                dedupe_hash=compute_dedupe_hash(Source.NPM_AUDIT, repo, rule_id, package_name),
                source=Source.NPM_AUDIT,
                rule_id=rule_id,
                title=title,
                description=description,
                severity=severity,
                repo=repo,
                branch=branch,
                commit_sha=commit_sha,
                package_name=package_name,
                package_version=vuln.get("range"),
                remediation=remediation,
                raw=vuln,
            )
        )
    return findings
