"""FastAPI app: the ingestion service's HTTP surface.

Three jobs, each behind one route - see ingestion/README.md for the full
request-flow diagram:

- ``POST /ingest``  receive one scanner's raw output, normalize it into
  Finding rows via app/parsers/, and upsert them by dedupe_hash.
- ``GET /findings``  list findings, filterable by severity/source/status/repo.
- ``GET /stats``     counts by severity and by source, for the dashboard.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from sqlmodel import Session, select

from app.db import get_session, init_db
from app.models import Finding
from app.parsers import PARSERS
from app.schema import FindingStatus, IngestRequest, Severity, Source


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create the SQLite tables once on startup; a no-op on every run after
    the first, since init_db() only creates tables that don't exist yet."""
    init_db()
    yield


app = FastAPI(title="vigilant-engine ingestion API", version="0.1.0", lifespan=lifespan)


@app.post("/ingest", response_model=list[Finding])
def ingest(request: IngestRequest, session: Session = Depends(get_session)) -> list[Finding]:
    """Normalize one scanner's raw output and upsert it into the findings table.

    "Upsert by dedupe_hash" is the trick that keeps repeat CI runs from
    flooding the table: each parsed Finding's dedupe_hash identifies *what*
    the issue is, independent of *when* it was seen. If a row with that hash
    already exists we only bump its ``last_seen`` (and reopen it if it had
    been marked fixed, since it clearly isn't fixed anymore); otherwise we
    insert a new row.
    """
    parse = PARSERS.get(request.source)
    if parse is None:
        raise HTTPException(status_code=400, detail=f"No parser registered for source={request.source}")

    parsed = parse(request.raw_output, repo=request.repo, branch=request.branch, commit_sha=request.commit_sha)

    now = datetime.now(timezone.utc)
    saved: list[Finding] = []
    for finding in parsed:
        existing = session.exec(select(Finding).where(Finding.dedupe_hash == finding.dedupe_hash)).first()
        if existing is not None:
            existing.last_seen = now
            if existing.status == FindingStatus.FIXED:
                existing.status = FindingStatus.OPEN
            session.add(existing)
            saved.append(existing)
        else:
            finding.first_seen = now
            finding.last_seen = now
            session.add(finding)
            saved.append(finding)

    session.commit()
    for row in saved:
        session.refresh(row)
    return saved


@app.get("/findings", response_model=list[Finding])
def list_findings(
    session: Session = Depends(get_session),
    severity: Optional[Severity] = None,
    source: Optional[Source] = None,
    status: Optional[FindingStatus] = None,
    repo: Optional[str] = None,
    limit: int = Query(default=100, le=1000),
) -> list[Finding]:
    """List findings, most recently seen first, optionally filtered by any
    combination of severity/source/status/repo - what the dashboard's
    findings table calls to render its rows."""
    query = select(Finding)
    if severity is not None:
        query = query.where(Finding.severity == severity)
    if source is not None:
        query = query.where(Finding.source == source)
    if status is not None:
        query = query.where(Finding.status == status)
    if repo is not None:
        query = query.where(Finding.repo == repo)
    query = query.order_by(Finding.last_seen.desc()).limit(limit)
    return list(session.exec(query).all())


@app.get("/stats")
def stats(session: Session = Depends(get_session)) -> dict:
    """Counts for the dashboard: open findings broken down by severity and
    by source. Deliberately simple (Python-side counting, not a SQL GROUP
    BY) since the findings table is small enough that it doesn't matter -
    worth revisiting if this ever needs to scale past a few thousand rows.
    """
    open_findings = session.exec(select(Finding).where(Finding.status == FindingStatus.OPEN)).all()

    by_severity = {s.value: 0 for s in Severity}
    by_source = {s.value: 0 for s in Source}
    for finding in open_findings:
        by_severity[finding.severity.value] += 1
        by_source[finding.source.value] += 1

    return {"total_open": len(open_findings), "by_severity": by_severity, "by_source": by_source}
