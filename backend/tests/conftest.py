"""Shared fixtures for the back-end tests."""

import os
import uuid

import psycopg
import pytest

from app import accounts, commissions

ADMIN_URL = os.environ.get("TEST_DATABASE_URL")


@pytest.fixture
def database(monkeypatch):
    """A fresh, empty database for one test, dropped afterwards."""
    if not ADMIN_URL:
        pytest.skip("TEST_DATABASE_URL is not set")
    name = f"ria_test_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(ADMIN_URL, autocommit=True) as admin:
        admin.execute(f'CREATE DATABASE "{name}"')
    url = psycopg.conninfo.make_conninfo(ADMIN_URL, dbname=name)
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setattr(accounts, "_schema_ready", False)
    monkeypatch.setattr(commissions, "_schema_ready", False)
    yield url
    with psycopg.connect(ADMIN_URL, autocommit=True) as admin:
        admin.execute(f'DROP DATABASE "{name}" WITH (FORCE)')
