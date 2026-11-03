import psycopg
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_db_without_database_url(monkeypatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    response = client.get("/api/health/db")
    assert response.status_code == 503


def _capture_connect(monkeypatch) -> dict:
    """Stub psycopg.connect: record its kwargs, then fail like a dead database."""
    seen: dict = {}

    def fake_connect(url, **kwargs):
        seen.update(kwargs)
        raise psycopg.OperationalError("no database here")

    monkeypatch.setenv("DATABASE_URL", "postgresql://ria@db.invalid/ria")
    monkeypatch.setattr(psycopg, "connect", fake_connect)
    return seen


def test_db_connect_timeout_defaults_to_3_seconds(monkeypatch) -> None:
    monkeypatch.delenv("DB_CONNECT_TIMEOUT", raising=False)
    seen = _capture_connect(monkeypatch)
    response = client.get("/api/health/db")
    assert response.status_code == 503
    assert seen["connect_timeout"] == 3


def test_db_connect_timeout_reads_the_environment(monkeypatch) -> None:
    monkeypatch.setenv("DB_CONNECT_TIMEOUT", "25")
    seen = _capture_connect(monkeypatch)
    response = client.get("/api/health/db")
    assert response.status_code == 503
    assert seen["connect_timeout"] == 25
