"""The persisted Finding table.

A Finding is the single row shape every scanner's raw output gets mapped
into by the modules in app/parsers/. It doubles as both the SQL table
definition *and* the FastAPI request/response schema - that's the whole
point of SQLModel (a thin layer combining SQLAlchemy + pydantic): one class
instead of a hand-written ORM model plus a separate pydantic schema that
would otherwise have to be kept in sync by hand every time a field changes.

Simplification worth knowing about: returning this table model directly
from API routes means every column is exposed as-is. A public-facing API
would usually define a separate, narrower `FindingRead` model to control
exactly what's returned - skipped here since this API isn't public.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from app.schema import FindingStatus, Severity, Source


def _utcnow() -> datetime:
    """Current UTC time, as a plain function so SQLModel's default_factory
    can call it fresh for every row instead of capturing one fixed value."""
    return datetime.now(timezone.utc)


class Finding(SQLModel, table=True):
    """One normalized security finding, from any scanner.

    Rows are deduplicated by ``dedupe_hash`` (see app/dedupe.py): the same
    real-world issue reported on every CI run updates ``last_seen`` on one
    row instead of inserting a new row each time.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    dedupe_hash: str = Field(index=True, unique=True, description="Stable hash used to collapse repeat findings across scans")
    source: Source
    rule_id: str = Field(description="Scanner's rule/check/CVE identifier, e.g. 'python.lang.security.audit.eval' or 'CVE-2023-1234'")
    title: str
    description: str = ""
    severity: Severity
    repo: str
    branch: str = "main"
    commit_sha: Optional[str] = None
    file_path: Optional[str] = Field(default=None, description="Source file for SAST/secrets findings; the affected URL for DAST findings; the image target for container findings")
    line_number: Optional[int] = None
    package_name: Optional[str] = Field(default=None, description="Set for SCA and container findings (npm audit, Snyk, Trivy)")
    package_version: Optional[str] = None
    remediation: Optional[str] = None
    status: FindingStatus = FindingStatus.OPEN
    first_seen: datetime = Field(default_factory=_utcnow)
    last_seen: datetime = Field(default_factory=_utcnow)
    raw: dict = Field(default_factory=dict, sa_column=Column(JSON), description="Original scanner record, kept for audit/debugging")
