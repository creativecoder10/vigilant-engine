"""Stable hashing for collapsing repeat findings across scans.

Without this, the same real-world issue reported on every CI run would
create a brand new row every time - the findings table would grow forever
and the dashboard would show the same bug listed hundreds of times. Instead
each parser hashes the fields that identify *what* the finding is (never
*when* it was found, and never anything scan-run-specific), and the
ingestion API upserts on that hash: a repeat scan updates ``last_seen`` on
the existing row instead of inserting a duplicate.
"""
from __future__ import annotations

import hashlib
from typing import Optional, Union

Part = Optional[Union[str, int]]


def compute_dedupe_hash(*parts: Part) -> str:
    """Hash the given identifying parts into one stable hex string.

    Each parser picks its own set of parts - whatever makes a finding
    unique for that scanner. For example: SAST findings are identified by
    rule + file + line, but SCA findings by rule + package name, since two
    packages can share the same advisory. See each module in app/parsers/
    for its exact choice.
    """
    joined = "|".join("" if p is None else str(p) for p in parts)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()
