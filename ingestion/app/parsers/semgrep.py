"""Normalize Semgrep's ``--json`` output into Finding rows.

Semgrep is a SAST tool: it scans *source code* for unsafe patterns (like
``eval()`` on user input) without ever running the program. Its severity
scale (ERROR/WARNING/INFO) doesn't line up with the CRITICAL/HIGH/MEDIUM/
LOW/INFO scale the rest of this project uses, so this module makes an
explicit, opinionated mapping - see SEVERITY_MAP. A more mature pipeline
would likely refine this per-rule using each finding's own metadata (CWE,
OWASP category) rather than one blanket mapping for every rule.
"""
from __future__ import annotations

from typing import Optional

from app.dedupe import compute_dedupe_hash
from app.models import Finding
from app.schema import Severity, Source

SEVERITY_MAP = {
    "ERROR": Severity.HIGH,
    "WARNING": Severity.MEDIUM,
    "INFO": Severity.LOW,
}


def parse(raw_output: dict, *, repo: str, branch: str = "main", commit_sha: Optional[str] = None) -> list[Finding]:
    """Turn one ``semgrep --json`` payload into a list of Finding rows.

    ``raw_output`` is the parsed JSON Semgrep writes to stdout: a dict with
    a top-level ``"results"`` list, one entry per rule match per location.
    """
    findings: list[Finding] = []
    for result in raw_output.get("results", []):
        rule_id = result.get("check_id", "unknown-rule")
        file_path = result.get("path")
        line_number = result.get("start", {}).get("line")
        extra = result.get("extra", {})
        message = extra.get("message", "")
        severity = SEVERITY_MAP.get(extra.get("severity", "INFO"), Severity.INFO)

        findings.append(
            Finding(
                dedupe_hash=compute_dedupe_hash(Source.SEMGREP, repo, rule_id, file_path, line_number),
                source=Source.SEMGREP,
                rule_id=rule_id,
                title=(message or rule_id)[:200],
                description=message,
                severity=severity,
                repo=repo,
                branch=branch,
                commit_sha=commit_sha,
                file_path=file_path,
                line_number=line_number,
                raw=result,
            )
        )
    return findings
