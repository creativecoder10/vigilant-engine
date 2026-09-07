"""Normalize gitleaks' JSON report into Finding rows.

gitleaks scans git history for committed secrets (API keys, passwords,
tokens) by matching regex rules. Unlike the other scanners it never emits a
severity - a rule either matched or it didn't - so this module assigns a
fixed CRITICAL severity to every hit. That's a deliberate simplification: a
leaked credential is treated as always-serious rather than trying to rank
"how bad" one secret is versus another, since a compromised key is a
compromised key regardless of which service it unlocks.

gitleaks also emits a bare JSON *array* at the top level, not an object like
every other scanner here - see the ``Union[dict, list]`` typing on
``IngestRequest.raw_output`` in app/schema.py.
"""
from __future__ import annotations

from typing import Optional

from app.dedupe import compute_dedupe_hash
from app.models import Finding
from app.schema import Severity, Source


def parse(raw_output: list, *, repo: str, branch: str = "main", commit_sha: Optional[str] = None) -> list[Finding]:
    """Turn one gitleaks JSON report (a top-level list) into Finding rows."""
    findings: list[Finding] = []
    for leak in raw_output:
        rule_id = leak.get("RuleID", "unknown-secret-rule")
        file_path = leak.get("File")
        line_number = leak.get("StartLine")

        findings.append(
            Finding(
                dedupe_hash=compute_dedupe_hash(Source.GITLEAKS, repo, rule_id, file_path, line_number),
                source=Source.GITLEAKS,
                rule_id=rule_id,
                title=leak.get("Description", rule_id),
                description=f"Matched secret pattern in commit {leak.get('Commit', 'unknown')}.",
                severity=Severity.CRITICAL,
                repo=repo,
                branch=branch,
                commit_sha=commit_sha or leak.get("Commit"),
                file_path=file_path,
                line_number=line_number,
                remediation="Rotate the exposed credential immediately and remove it from git history.",
                raw=leak,
            )
        )
    return findings
