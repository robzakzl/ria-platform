"""Commissions and fees charged to accounts: table `commissions` and the /api/commissions endpoint.

The table is created on the first commissions request each process makes, after the accounts table
(app.accounts), and filled at that moment with app.sample_commissions for every account that exists
then, so each database is seeded once.
"""

from datetime import date
from decimal import Decimal
from enum import StrEnum
from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app import accounts
from app.sample_commissions import sample_commissions

router = APIRouter(prefix="/api/commissions", tags=["commissions"])

# Any constant other than accounts._SCHEMA_LOCK: serialises table creation and seeding.
_SCHEMA_LOCK = 1_385_001

_CREATE_TABLE = """
CREATE TABLE commissions (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id       BIGINT NOT NULL REFERENCES accounts (id),
    charged_on       DATE NOT NULL,
    commission_type  TEXT NOT NULL
                     CHECK (commission_type IN ('Per Order', 'Percentage', 'Minimum', 'Monthly')),
    amount           NUMERIC(14, 2) NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX commissions_charged_on ON commissions (charged_on DESC, id DESC);
CREATE INDEX commissions_account ON commissions (account_id)
"""

_schema_ready = False


class CommissionType(StrEnum):
    PER_ORDER = "Per Order"
    PERCENTAGE = "Percentage"
    MINIMUM = "Minimum"
    MONTHLY = "Monthly"


class Commission(BaseModel):
    id: int
    account_id: int
    account_name: str
    charged_on: date
    commission_type: CommissionType
    amount: Decimal


class CommissionPage(BaseModel):
    items: list[Commission]
    page: int
    page_size: int
    # Over every commission matching the filters, not only this page.
    total_count: int
    total_amount: Decimal


def _ensure_schema(conn: psycopg.Connection) -> None:
    """Create and seed the commissions table if this database has none yet."""
    global _schema_ready
    if _schema_ready:
        return
    with conn.transaction():
        conn.execute("SET LOCAL lock_timeout = '10s'")
        conn.execute("SELECT pg_advisory_xact_lock(%s)", (_SCHEMA_LOCK,))
        exists = conn.execute("SELECT to_regclass('commissions') IS NOT NULL AS e").fetchone()["e"]
        if not exists:
            conn.execute(_CREATE_TABLE)
            ids = [r["id"] for r in conn.execute("SELECT id FROM accounts ORDER BY id").fetchall()]
            with conn.cursor().copy(
                "COPY commissions (account_id, charged_on, commission_type, amount) FROM STDIN"
            ) as copy:
                for account_id in ids:
                    for row in sample_commissions(account_id):
                        copy.write_row((account_id, *row))
    _schema_ready = True


def connection(conn: accounts.Conn) -> psycopg.Connection:
    """FastAPI dependency: a connection to a database whose commissions table exists."""
    _ensure_schema(conn)
    return conn


Conn = Annotated[psycopg.Connection, Depends(connection)]


@router.get("")
def list_commissions(
    conn: Conn,
    date_from: date | None = None,
    date_to: date | None = None,
    commission_type: CommissionType | None = None,
    account_id: Annotated[int | None, Query(ge=1, le=2**63 - 1)] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> CommissionPage:
    """Commissions matching every given filter (dates inclusive), newest first, one page."""
    where, params = [], []
    for clause, value in (
        ("c.charged_on >= %s", date_from),
        ("c.charged_on <= %s", date_to),
        ("c.commission_type = %s", commission_type and commission_type.value),
        ("c.account_id = %s", account_id),
    ):
        if value is not None:
            where.append(clause)
            params.append(value)
    sql_where = f"WHERE {' AND '.join(where)}" if where else ""
    totals = conn.execute(
        f"SELECT count(*) AS n, coalesce(sum(c.amount), 0) AS total FROM commissions c {sql_where}",
        params,
    ).fetchone()
    rows = conn.execute(
        f"""SELECT c.id, c.account_id, a.first_name || ' ' || a.last_name AS account_name,
                   c.charged_on, c.commission_type, c.amount
            FROM commissions c JOIN accounts a ON a.id = c.account_id
            {sql_where}
            ORDER BY c.charged_on DESC, c.id DESC
            LIMIT %s OFFSET %s""",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return CommissionPage(
        items=[Commission(**r) for r in rows],
        page=page,
        page_size=page_size,
        total_count=totals["n"],
        total_amount=totals["total"],
    )
