"""Database engine wiring. Reuses the repo-root .env DATABASE_URL."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")


def normalize_url(url: str) -> str:
    """Prisma-style postgres URL -> SQLAlchemy + pg8000 driver URL.

    - postgresql://...          -> postgresql+pg8000://...
    - drops the query string (?schema=public), which pg8000 does not accept.
    """
    parts = urlsplit(url)
    scheme = parts.scheme
    if scheme in ("postgres", "postgresql"):
        scheme = "postgresql+pg8000"
    return urlunsplit((scheme, parts.netloc, parts.path, "", ""))


def get_engine(url: str | None = None) -> Engine:
    raw = url or os.environ.get("DATABASE_URL")
    if not raw:
        raise RuntimeError(
            "DATABASE_URL is not set (checked the environment and the repo-root .env)."
        )
    return create_engine(normalize_url(raw), future=True, pool_pre_ping=True)
