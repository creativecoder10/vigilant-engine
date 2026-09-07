"""Shared vocabulary for the ingestion service: enums and the /ingest request shape.

Mirrors the CIM idea from log normalization: Semgrep, npm audit, Snyk, and
friends all describe findings differently, but downstream (dedup, scoring,
dashboard) only ever needs to understand one shape. That shape itself -
``Finding`` - lives in ``app/models.py`` rather than here, because it is
both a database table *and* the API's response schema; this module holds
only the enums it's built from, plus the request payload scanners POST in.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional, Union

from pydantic import BaseModel


class Severity(str, Enum):
    """How urgent a finding is. Every scanner uses different words for this
    (Semgrep: ERROR/WARNING/INFO, Trivy: CRITICAL/HIGH/..., ZAP: risk +
    confidence) - each parser in app/parsers/ maps its own scale onto this
    one, so the dashboard only ever has to reason about five values."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class FindingStatus(str, Enum):
    """Where a finding is in its remediation lifecycle - this is the part
    that turns "a scanner found something" into an actual workflow a team
    can act on."""

    OPEN = "open"
    TRIAGED = "triaged"
    FIXED = "fixed"
    IGNORED = "ignored"
    FALSE_POSITIVE = "false_positive"


class Source(str, Enum):
    """Which tool produced a finding. Each value here must have a matching
    parser registered in app/parsers/__init__.py's PARSERS dict."""

    SEMGREP = "semgrep"
    NPM_AUDIT = "npm_audit"
    SNYK = "snyk"
    ZAP = "zap"
    GITLEAKS = "gitleaks"
    TRIVY = "trivy"


class IngestRequest(BaseModel):
    """Payload CI posts to /ingest: one scanner's raw output plus the repo
    context it ran against.

    ``raw_output`` is deliberately typed as either a dict or a list, because
    scanners don't agree on a top-level JSON shape: most (Semgrep, npm
    audit, Snyk, ZAP, Trivy) emit an object, but gitleaks emits a bare JSON
    array of findings. The matching parser for ``source`` knows which shape
    to expect.
    """

    source: Source
    repo: str
    branch: str = "main"
    commit_sha: Optional[str] = None
    raw_output: Union[dict, list]
