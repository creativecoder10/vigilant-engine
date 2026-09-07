"""Tests for each scanner parser: does raw tool output become the right Finding rows?

Each test loads a small, realistic fixture (tests/fixtures/<tool>.json) - a
trimmed real sample of what that tool actually emits - and checks the
parser extracts the fields we care about (severity, package, rule id, ...)
into the shared Finding shape. If you're new to this: these are the closest
thing to "proof the normalization logic works," independent of the API or
database around it.
"""
from __future__ import annotations

import json
from pathlib import Path

from app.parsers import gitleaks, npm_audit, semgrep, snyk, trivy, zap
from app.schema import Severity

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str):
    return json.loads((FIXTURES / name).read_text())


def test_semgrep_parses_eval_finding():
    findings = semgrep.parse(load("semgrep.json"), repo="demo-target")
    assert len(findings) == 1
    assert findings[0].severity == Severity.HIGH
    assert "eval" in findings[0].description.lower()
    assert findings[0].file_path == "routes/search.py"


def test_npm_audit_parses_lodash_finding():
    findings = npm_audit.parse(load("npm_audit.json"), repo="demo-target")
    assert len(findings) == 1
    assert findings[0].package_name == "lodash"
    assert findings[0].severity == Severity.HIGH
    assert "npm audit fix" in findings[0].remediation


def test_snyk_parses_minimist_finding():
    findings = snyk.parse(load("snyk.json"), repo="demo-target")
    assert len(findings) == 1
    assert findings[0].package_name == "minimist"
    assert findings[0].severity == Severity.MEDIUM
    assert "1.2.6" in findings[0].remediation


def test_zap_parses_xss_finding():
    findings = zap.parse(load("zap.json"), repo="demo-target")
    assert len(findings) == 1
    assert findings[0].severity == Severity.HIGH
    assert findings[0].file_path.startswith("http://localhost:3000")


def test_gitleaks_parses_secret_finding():
    findings = gitleaks.parse(load("gitleaks.json"), repo="demo-target")
    assert len(findings) == 1
    assert findings[0].severity == Severity.CRITICAL
    assert findings[0].file_path == "config/aws.py"


def test_trivy_parses_container_finding():
    findings = trivy.parse(load("trivy.json"), repo="demo-target")
    assert len(findings) == 1
    assert findings[0].package_name == "zlib1g"
    assert findings[0].severity == Severity.HIGH


def test_dedupe_hash_is_stable_across_repeated_parses():
    """Parsing the same input twice must produce the same dedupe_hash - this
    is what makes upsert-on-rescan work instead of creating duplicate rows
    every time CI runs."""
    first = semgrep.parse(load("semgrep.json"), repo="demo-target")[0]
    second = semgrep.parse(load("semgrep.json"), repo="demo-target")[0]
    assert first.dedupe_hash == second.dedupe_hash


def test_dedupe_hash_differs_by_repo():
    """The same code issue in two different repos must NOT collapse into one
    row - repo is part of the hash on purpose."""
    a = semgrep.parse(load("semgrep.json"), repo="repo-a")[0]
    b = semgrep.parse(load("semgrep.json"), repo="repo-b")[0]
    assert a.dedupe_hash != b.dedupe_hash
