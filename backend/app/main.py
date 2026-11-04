"""ria-platform API entrypoint."""

import psycopg
from fastapi import FastAPI, HTTPException

from app import accounts, db

app = FastAPI(title="ria-platform API")
app.include_router(accounts.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness: the API process is up. Needs no database."""
    return {"status": "ok"}


@app.get("/api/health/db")
def health_db() -> dict[str, str]:
    """Readiness: the API can reach PostgreSQL at DATABASE_URL within DB_CONNECT_TIMEOUT seconds."""
    try:
        with db.connect() as conn:
            conn.execute("SELECT 1")
    except db.DatabaseNotConfigured as exc:
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set") from exc
    except psycopg.Error as exc:
        raise HTTPException(status_code=503, detail="database unreachable") from exc
    return {"status": "ok", "database": "ok"}
