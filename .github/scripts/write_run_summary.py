#!/usr/bin/env python3
"""Fetch /stats from the ingestion API and write a human-readable run
summary to GitHub's job summary page (the GITHUB_STEP_SUMMARY file), in
addition to printing the raw JSON for the plain log.

Uses only the Python standard library, matching post_to_ingestion.py's
approach - no extra pip install needed in the CI job.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


def main() -> None:
    api_url = os.environ.get("INGESTION_API_URL", "http://localhost:8000")
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")

    try:
        with urllib.request.urlopen(f"{api_url}/stats") as response:
            stats = json.load(response)
    except urllib.error.URLError as exc:
        # This step runs with `if: always()` so it also fires when an
        # earlier step (most likely `pytest`) failed and the ingestion API
        # was therefore never started - report that plainly instead of a
        # raw connection-error traceback obscuring the real failure.
        message = f"Ingestion API was not reachable at {api_url} ({exc}) - likely an earlier step failed before it started."
        print(message)
        if summary_path:
            with open(summary_path, "a") as handle:
                handle.write(f"## Scan results summary\n\n{message}\n")
        return

    print(json.dumps(stats, indent=2))

    if not summary_path:
        return

    lines = [
        "## Scan results summary",
        "",
        f"**Total open findings:** {stats['total_open']}",
        "",
        "| Source | Findings |",
        "| --- | --- |",
    ]
    for source, count in stats["by_source"].items():
        lines.append(f"| {source} | {count} |")

    lines += [
        "",
        "| Severity | Findings |",
        "| --- | --- |",
    ]
    for severity, count in stats["by_severity"].items():
        lines.append(f"| {severity} | {count} |")

    with open(summary_path, "a") as handle:
        handle.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
