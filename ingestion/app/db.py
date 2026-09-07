"""Database engine and session management for the ingestion service.

Uses SQLite for local development and CI (see the root README for why:
zero setup, fine for this scale). Because SQLModel sits on top of
SQLAlchemy, moving to Postgres later is a one-line change to
``DATABASE_URL`` - none of the application code that uses ``get_session``
needs to change.
"""
from __future__ import annotations

import os
from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./findings.db")

# SQLite only: by default it refuses to share one connection across threads,
# but FastAPI's request handling can use a different thread per request.
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=_connect_args)


def init_db() -> None:
    """Create any tables that don't exist yet. Safe to call on every startup -
    it never touches tables/rows that already exist."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency that hands each request its own database session,
    and closes it when the request is done."""
    with Session(engine) as session:
        yield session
