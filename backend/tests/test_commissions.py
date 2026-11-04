from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app import commissions
from app.main import app
from app.sample_commissions import sample_commissions

client = TestClient(app)

NEW_ACCOUNT = {
    "first_name": "Grace",
    "last_name": "Hopper",
    "address": {"street1": "2 Elm St", "city": "Austin", "state": "TX", "zip": "78701"},
    "account_type": "IRA",
    "cash_balance": "10.00",
}


def test_sample_commissions_per_account() -> None:
    rows = sample_commissions(7)
    assert rows == sample_commissions(7)  # deterministic
    assert rows != sample_commissions(8)
    months = {(d.year, d.month) for d, _, _ in rows}
    assert months == {(2026, m) for m in range(5, 11)}
    for year, month in months:
        in_month = [(d, t, a) for d, t, a in rows if (d.year, d.month) == (year, month)]
        monthly = [r for r in in_month if r[1] == "Monthly"]
        orders = [r for r in in_month if r[1] == "Per Order"]
        assert monthly == [(date(year, month, 1), "Monthly", Decimal("10.00"))]
        assert len(orders) == 20
        assert all(Decimal("10.00") <= a <= Decimal("15.00") for _, _, a in orders)
        assert all(a == a.quantize(Decimal("0.01")) for _, _, a in orders)
    assert len(rows) == 6 * 21


@pytest.fixture
def no_db():
    app.dependency_overrides[commissions.connection] = lambda: None
    yield
    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    "query",
    [
        "commission_type=Flat",
        "date_from=2026-13-01",
        "account_id=0",
        "page=0",
        "page_size=101",
    ],
)
def test_list_rejects_invalid_filters(no_db, query) -> None:
    assert client.get(f"/api/commissions?{query}").status_code == 422


def test_commissions_without_database_url(monkeypatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert client.get("/api/commissions").status_code == 503


# --- Against a real PostgreSQL: runs when TEST_DATABASE_URL is set (./dc check full sets it) ---


def get(**params) -> dict:
    r = client.get("/api/commissions", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_new_database_is_seeded_for_every_account(database) -> None:
    body = get(page_size=100)
    assert body["total_count"] == 50 * 6 * 21
    assert body["page"] == 1 and body["page_size"] == 100
    assert len(body["items"]) == 100
    first = body["items"][0]
    assert set(first) == {
        "id",
        "account_id",
        "account_name",
        "charged_on",
        "commission_type",
        "amount",
    }
    dates = [i["charged_on"] for i in body["items"]]
    assert dates == sorted(dates, reverse=True)
    assert dates[0] <= "2026-10-31"
    expected = sum(a for i in range(1, 51) for _, _, a in sample_commissions(i))
    assert Decimal(body["total_amount"]) == expected
    monthly = get(commission_type="Monthly")
    assert monthly["total_count"] == 300
    assert Decimal(monthly["total_amount"]) == Decimal("3000.00")
    assert get(commission_type="Percentage")["total_count"] == 0
    assert get(commission_type="Minimum")["total_count"] == 0


def test_filters_combine_and_pages_partition(database) -> None:
    one = get(account_id=3, date_from="2026-06-01", date_to="2026-06-30")
    assert one["total_count"] == 21
    assert all(i["account_id"] == 3 for i in one["items"])
    assert all("2026-06-01" <= i["charged_on"] <= "2026-06-30" for i in one["items"])
    orders = get(account_id=3, commission_type="Per Order", date_from="2026-06-01")
    assert orders["total_count"] == 5 * 20
    filters = {"account_id": 3, "commission_type": "Per Order", "date_from": "2026-06-01"}
    seen = [i["id"] for page in range(1, 6) for i in get(**filters, page=page)["items"]]
    assert len(seen) == len(set(seen)) == 100
    assert get(page=999)["items"] == []
    assert get(date_from="2026-11-01")["total_count"] == 0


def test_account_created_after_seeding_has_no_commissions(database) -> None:
    get()
    created = client.post("/api/accounts", json=NEW_ACCOUNT).json()
    assert get(account_id=created["id"])["total_count"] == 0
    assert get()["total_count"] == 50 * 6 * 21
