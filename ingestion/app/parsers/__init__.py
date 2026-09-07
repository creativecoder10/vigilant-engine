"""Parser registry: maps each Source to the function that normalizes its raw output.

This is what lets app/main.py's POST /ingest stay generic - it never needs
an if/elif chain over every tool. Adding a seventh scanner later means
writing one new module here (a ``parse(raw_output, *, repo, branch,
commit_sha) -> list[Finding]`` function) and adding one line to PARSERS
below; nothing in main.py or the schema has to change.
"""
from __future__ import annotations

from app.parsers import gitleaks, npm_audit, semgrep, snyk, trivy, zap
from app.schema import Source

PARSERS = {
    Source.SEMGREP: semgrep.parse,
    Source.NPM_AUDIT: npm_audit.parse,
    Source.SNYK: snyk.parse,
    Source.ZAP: zap.parse,
    Source.GITLEAKS: gitleaks.parse,
    Source.TRIVY: trivy.parse,
}
