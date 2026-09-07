"""Normalize an OWASP ZAP baseline scan JSON report into Finding rows.

ZAP is a DAST tool: unlike every other scanner here, it never reads source
code - it attacks the *running* application over HTTP, the way an external
attacker would, and reports what it could observe or exploit. That means
there's no ``file_path``/``line_number`` to record; the closest equivalent
is the URL of the affected endpoint, which this parser stores in
``file_path`` for lack of a more specific field in the shared schema.

ZAP also packs its severity into a single string like ``"High (Medium)"`` -
``"<Risk> (<Confidence>)"``. This parser only uses the risk half; confidence
(how sure ZAP is that this isn't a false positive) is preserved in ``raw``
for anyone who wants to factor it into triage later.
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
    "informational": Severity.INFO,
}


def parse(raw_output: dict, *, repo: str, branch: str = "main", commit_sha: Optional[str] = None) -> list[Finding]:
    """Turn one ZAP baseline JSON report into a list of Finding rows."""
    findings: list[Finding] = []
    for site in raw_output.get("site", []):
        for alert in site.get("alerts", []):
            rule_id = str(alert.get("pluginid", "unknown-zap-rule"))
            risk = alert.get("riskdesc", "Informational").split(" ")[0].lower()
            severity = SEVERITY_MAP.get(risk, Severity.INFO)
            instances = alert.get("instances", [])
            endpoint = instances[0].get("uri") if instances else site.get("@name")

            findings.append(
                Finding(
                    dedupe_hash=compute_dedupe_hash(Source.ZAP, repo, rule_id, endpoint),
                    source=Source.ZAP,
                    rule_id=rule_id,
                    title=alert.get("alert", rule_id),
                    description=alert.get("desc", ""),
                    severity=severity,
                    repo=repo,
                    branch=branch,
                    commit_sha=commit_sha,
                    file_path=endpoint,
                    remediation=alert.get("solution"),
                    raw=alert,
                )
            )
    return findings
