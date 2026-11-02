"""ria-platform API entrypoint."""

import os

import psycopg
from fastapi import FastAPI, HTTPException

app = FastAPI(title="ria-platform API")


@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness: the API process is up. Needs no database."""
    return {"status": "ok"}


@app.get("/api/health/db")
def health_db() -> dict[str, str]:
    """Readiness: the API can reach PostgreSQL at DATABASE_URL."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set")
    try:
        with psycopg.connect(url, connect_timeout=3) as conn:
            conn.execute("SELECT 1")
    except psycopg.Error as exc:
        raise HTTPException(status_code=503, detail="database unreachable") from exc
    return {"status": "ok", "database": "ok"}
