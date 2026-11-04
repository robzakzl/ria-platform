from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app import accounts
from app.main import app

client = TestClient(app)

VALID = {
    "first_name": "Ada",
    "last_name": "Lovelace",
    "address": {"street1": "1 Main St", "city": "Boston", "state": "ma", "zip": "02110"},
    "account_type": "Joint",
    "cash_balance": "1234.50",
}


@pytest.fixture
def no_db():
    """Accounts endpoints with the database dependency replaced by nothing (validation only)."""
    app.dependency_overrides[accounts.connection] = lambda: None
    yield
    app.dependency_overrides.clear()


def test_accounts_without_database_url(monkeypatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert client.get("/api/accounts").status_code == 503


@pytest.mark.parametrize(
    "change",
    [
        {"account_type": "Roth"},
        {"first_name": "  "},
        {"first_name": "a\u0000b"},
        {"cash_balance": "1.234"},
        {"address": {**VALID["address"], "state": "Mass"}},
        {"address": {**VALID["address"], "zip": "2110"}},
    ],
)
def test_create_rejects_invalid_accounts(no_db, change) -> None:
    assert client.post("/api/accounts", json={**VALID, **change}).status_code == 422


def test_get_rejects_out_of_range_id(no_db) -> None:
    assert client.get("/api/accounts/0").status_code == 422
    assert client.get(f"/api/accounts/{2**63}").status_code == 422


# --- Against a real PostgreSQL: runs when TEST_DATABASE_URL is set (./dc check full sets it) ---


def test_new_database_is_seeded_with_50_sample_accounts(database) -> None:
    response = client.get("/api/accounts")
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 50
    assert [r["id"] for r in rows] == list(range(1, 51))
    assert {r["account_type"] for r in rows} == {"IRA", "Standard", "Joint"}


def test_create_then_read_an_account(database) -> None:
    created = client.post("/api/accounts", json=VALID)
    assert created.status_code == 201
    body = created.json()
    assert body["id"] == 51
    assert body["address"] == {
        "street1": "1 Main St",
        "street2": None,
        "city": "Boston",
        "state": "MA",
        "zip": "02110",
    }
    assert Decimal(body["cash_balance"]) == Decimal("1234.50")

    fetched = client.get(f"/api/accounts/{body['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == body
    assert client.get("/api/accounts/9999").status_code == 404


def test_seed_runs_once_per_database(database, monkeypatch) -> None:
    client.post("/api/accounts", json=VALID)
    monkeypatch.setattr(accounts, "_schema_ready", False)  # a new API process
    assert len(client.get("/api/accounts").json()) == 51


def test_blank_street2_is_stored_as_null(database) -> None:
    body = {**VALID, "address": {**VALID["address"], "street2": "   "}}
    created = client.post("/api/accounts", json=body).json()
    assert created["address"]["street2"] is None
    assert client.get(f"/api/accounts/{created['id']}").json()["address"]["street2"] is None


def test_concurrent_first_requests_seed_once(database) -> None:
    with ThreadPoolExecutor(8) as pool:
        counts = list(pool.map(lambda _: len(client.get("/api/accounts").json()), range(8)))
    assert counts == [50] * 8
