"""Database access: the one place the API opens a PostgreSQL connection."""

import os

import psycopg


class DatabaseNotConfigured(RuntimeError):
    """DATABASE_URL is not set."""


def connect(**kwargs) -> psycopg.Connection:
    """Connect to DATABASE_URL, giving up after DB_CONNECT_TIMEOUT seconds (default 3)."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise DatabaseNotConfigured("DATABASE_URL is not set")
    timeout = int(os.environ.get("DB_CONNECT_TIMEOUT", "3"))
    return psycopg.connect(url, connect_timeout=timeout, **kwargs)
