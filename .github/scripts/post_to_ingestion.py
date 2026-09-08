#!/usr/bin/env python3
"""Post one scanner's raw JSON output to the ingestion API's /ingest endpoint.

Shared by every CI job in .github/workflows/ - each scanner step just calls
this with a different --source/--file, instead of the workflow YAML
hand-rolling a curl+JSON incantation once per tool. Uses only the Python
standard library (urllib) so it needs no extra pip install beyond what the
ingestion service itself already requires in the CI job.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="A Source enum value: semgrep, npm_audit, snyk, zap, gitleaks, or trivy")
    parser.add_argument("--file", required=True, help="Path to the scanner's raw JSON output")
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", "unknown-repo"))
    parser.add_argument("--branch", default=os.environ.get("GITHUB_REF_NAME", "main"))
    parser.add_argument("--commit-sha", default=os.environ.get("GITHUB_SHA"))
    parser.add_argument("--api-url", default=os.environ.get("INGESTION_API_URL", "http://localhost:8000"))
    args = parser.parse_args()

    with open(args.file) as handle:
        raw_output = json.load(handle)

    payload = {
        "source": args.source,
        "repo": args.repo,
        "branch": args.branch,
        "commit_sha": args.commit_sha,
        "raw_output": raw_output,
    }

    request = urllib.request.Request(
        f"{args.api_url}/ingest",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request) as response:
            findings = json.load(response)
    except urllib.error.HTTPError as exc:
        print(f"Ingestion API rejected {args.source} results: {exc.read().decode()}", file=sys.stderr)
        raise

    print(f"Ingested {len(findings)} finding(s) from {args.source}")


if __name__ == "__main__":
    main()
