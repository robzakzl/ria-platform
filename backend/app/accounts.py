"""Client accounts: storage (PostgreSQL table `accounts`) and the /api/accounts endpoints.

The table is created on the first accounts request each process makes, and filled with the 50
sample accounts from app.sample_accounts when it is created, so each database is seeded once.
"""

from collections.abc import Iterator
from decimal import Decimal
from enum import StrEnum
from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Path
from psycopg.rows import dict_row
from pydantic import BaseModel, Field, StringConstraints

from app import db
from app.sample_accounts import SAMPLE_ACCOUNTS

router = APIRouter(prefix="/api/accounts", tags=["accounts"])

# Any constant: serialises table creation and seeding across concurrent API processes.
_SCHEMA_LOCK = 1_334_001

_CREATE_TABLE = """
CREATE TABLE accounts (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name    TEXT NOT NULL,
    last_name     TEXT NOT NULL,
    street1       TEXT NOT NULL,
    street2       TEXT,
    city          TEXT NOT NULL,
    state         CHAR(2) NOT NULL,
    zip           TEXT NOT NULL,
    account_type  TEXT NOT NULL CHECK (account_type IN ('IRA', 'Standard', 'Joint')),
    cash_balance  NUMERIC(14, 2) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""

_COLUMNS = "first_name, last_name, street1, street2, city, state, zip, account_type, cash_balance"
_INSERT = f"INSERT INTO accounts ({_COLUMNS}) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)"
_SELECT = f"SELECT id, {_COLUMNS} FROM accounts"

_schema_ready = False


class AccountType(StrEnum):
    IRA = "IRA"
    STANDARD = "Standard"
    JOINT = "Joint"


# PostgreSQL text cannot hold NUL, so it is rejected here (422) rather than failing in the database.
_NO_NUL = r"^[^\x00]*$"
Text = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200, pattern=_NO_NUL)
]


class Address(BaseModel):
    street1: Text
    street2: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=200, pattern=_NO_NUL)]
        | None
    ) = None
    city: Text
    state: Annotated[
        str, StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Za-z]{2}$")
    ]
    zip: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{5}(-\d{4})?$")]


class AccountIn(BaseModel):
    first_name: Text
    last_name: Text
    address: Address
    account_type: AccountType
    # US dollars, to the cent; may be negative (an overdrawn account).
    cash_balance: Annotated[Decimal, Field(max_digits=14, decimal_places=2)]


class Account(AccountIn):
    id: int


def _ensure_schema(conn: psycopg.Connection) -> None:
    """Create and seed the accounts table if this database has none yet."""
    global _schema_ready
    if _schema_ready:
        return
    with conn.transaction():
        # A stalled holder turns waiters into a 503 (LockNotAvailable), not a hung request.
        conn.execute("SET LOCAL lock_timeout = '10s'")
        conn.execute("SELECT pg_advisory_xact_lock(%s)", (_SCHEMA_LOCK,))
        exists = conn.execute("SELECT to_regclass('accounts') IS NOT NULL AS e").fetchone()["e"]
        if not exists:
            conn.execute(_CREATE_TABLE)
            with conn.cursor() as cur:
                cur.executemany(_INSERT, [_params(AccountIn(**a)) for a in SAMPLE_ACCOUNTS])
    _schema_ready = True


def _params(a: AccountIn) -> tuple:
    ad = a.address
    return (
        a.first_name,
        a.last_name,
        ad.street1,
        ad.street2 or None,
        ad.city,
        ad.state,
        ad.zip,
        a.account_type.value,
        a.cash_balance,
    )


def _account(row: dict) -> Account:
    return Account(
        id=row["id"],
        first_name=row["first_name"],
        last_name=row["last_name"],
        address=Address(
            street1=row["street1"],
            street2=row["street2"],
            city=row["city"],
            state=row["state"],
            zip=row["zip"],
        ),
        account_type=row["account_type"],
        cash_balance=row["cash_balance"],
    )


def connection() -> Iterator[psycopg.Connection]:
    """FastAPI dependency: a connection to a database whose accounts table exists."""
    try:
        with db.connect(row_factory=dict_row) as conn:
            _ensure_schema(conn)
            yield conn
    except db.DatabaseNotConfigured as exc:
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set") from exc
    except psycopg.OperationalError as exc:
        raise HTTPException(status_code=503, detail="database unreachable") from exc


Conn = Annotated[psycopg.Connection, Depends(connection)]


@router.get("")
def list_accounts(conn: Conn) -> list[Account]:
    """Every account, oldest first."""
    return [_account(r) for r in conn.execute(f"{_SELECT} ORDER BY id").fetchall()]


@router.get("/{account_id}")
def get_account(account_id: Annotated[int, Path(ge=1, le=2**63 - 1)], conn: Conn) -> Account:
    row = conn.execute(f"{_SELECT} WHERE id = %s", (account_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="account not found")
    return _account(row)


@router.post("", status_code=201)
def create_account(account: AccountIn, conn: Conn) -> Account:
    row = conn.execute(f"{_INSERT} RETURNING id, {_COLUMNS}", _params(account)).fetchone()
    # Commit before returning: the dependency closes the connection only after the response is sent.
    conn.commit()
    return _account(row)
