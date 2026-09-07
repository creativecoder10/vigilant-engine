"""End-to-end tests for the ingestion API: POST /ingest, GET /findings, GET /stats.

Each test gets its own isolated in-memory SQLite database via a FastAPI
dependency override, instead of touching the real findings.db - so running
tests never depends on, or pollutes, local dev data.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.db import get_session
from app.main import app

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str):
    return json.loads((FIXTURES / name).read_text())


@pytest.fixture()
def client():
    # StaticPool matters here: a plain `sqlite://` (in-memory) engine hands
    # out a brand new, empty database on every connection checkout, so the
    # tables created below would vanish before the first request used them.
    # StaticPool pins the engine to one single connection instead.
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    def get_session_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = get_session_override
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_ingest_then_list_findings(client):
    payload = {"source": "semgrep", "repo": "demo-target", "raw_output": load("semgrep.json")}

    response = client.post("/ingest", json=payload)
    assert response.status_code == 200
    assert len(response.json()) == 1

    listed = client.get("/findings").json()
    assert len(listed) == 1
    assert listed[0]["severity"] == "high"


def test_ingest_twice_upserts_instead_of_duplicating(client):
    """This is the behavior the whole dedupe_hash design exists for: scanning
    the same repo twice must update one row, not create a second one."""
    payload = {"source": "semgrep", "repo": "demo-target", "raw_output": load("semgrep.json")}

    first = client.post("/ingest", json=payload).json()
    second = client.post("/ingest", json=payload).json()

    assert first[0]["id"] == second[0]["id"]
    assert second[0]["last_seen"] >= first[0]["last_seen"]

    listed = client.get("/findings").json()
    assert len(listed) == 1


def test_ingest_rejects_unknown_source(client):
    response = client.post("/ingest", json={"source": "not-a-real-scanner", "repo": "x", "raw_output": {}})
    assert response.status_code == 422  # pydantic rejects it before it even reaches our code


def test_stats_counts_by_severity_and_source(client):
    client.post("/ingest", json={"source": "npm_audit", "repo": "demo-target", "raw_output": load("npm_audit.json")})

    stats = client.get("/stats").json()
    assert stats["total_open"] == 1
    assert stats["by_severity"]["high"] == 1
    assert stats["by_source"]["npm_audit"] == 1


def test_findings_can_be_filtered_by_severity(client):
    client.post("/ingest", json={"source": "semgrep", "repo": "demo-target", "raw_output": load("semgrep.json")})
    client.post("/ingest", json={"source": "snyk", "repo": "demo-target", "raw_output": load("snyk.json")})

    high_only = client.get("/findings", params={"severity": "high"}).json()
    assert len(high_only) == 1
    assert high_only[0]["source"] == "semgrep"
