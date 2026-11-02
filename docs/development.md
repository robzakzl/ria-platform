# Development

How to build, run and test ria-platform. This file is the single home for those commands; the README,
`CLAUDE.md` and `AGENTS.md` point here.

## Layout

| Path | What it is |
|---|---|
| `backend/` | The API: Python 3.12+, FastAPI. Code in `backend/app/`, tests in `backend/tests/`. |
| `frontend/` | The web app: React + TypeScript, built with Vite. Code and tests in `frontend/src/`. |
| `compose.yaml` | The local stack: PostgreSQL, the API, and the web app served by nginx. |
| `dc` | The one entrypoint: starts and stops the stack and runs the checks. |
| `scripts/check.sh` | The checks `./dc check` runs. |
| `.github/workflows/ci.yml` | CI: runs `./dc check full` on every push to `main`/`develop` and every PR. |

Generated, never committed: `backend/.venv/`, `frontend/node_modules/`, `frontend/dist/`.

## Prerequisites

Python 3.12+, Node 24 with npm, and Docker with Compose v2. Nothing else: no `.env` is needed.

## Run it

| Command | What it does |
|---|---|
| `./dc up` | Builds and starts the whole stack, waiting until every service is healthy. |
| `./dc down` | Stops it. The database is kept. |
| `./dc reset` | Stops it and deletes the local database (asks first). |
| `./dc <args>` | Any other `docker compose` command, e.g. `./dc logs -f api`. |

Default addresses: web http://127.0.0.1:5173, API http://127.0.0.1:8000 (docs at `/docs`),
PostgreSQL on 127.0.0.1:5432 (user, password and database all `ria`). To change a port or the database
login, copy `.env.example` to `.env` and set it there; `./dc` always reads this worktree's `.env` first.

For a faster edit loop, run the API and web outside containers with the database from the stack:

```bash
./dc up db
cd backend && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
DATABASE_URL=postgresql://ria:ria@127.0.0.1:5432/ria .venv/bin/uvicorn app.main:app --reload
cd frontend && npm ci && npm run dev    # forwards /api to http://localhost:8000 (override: API_URL)
```

## Test it

| Command | What it runs | Time |
|---|---|---|
| `./dc check quick` | Back end: `ruff check`, `ruff format --check`, `pytest`. Web: `tsc` type-check, `vitest`. | ~25s cold, seconds warm |
| `./dc check full` | Quick, plus the web production build and a smoke test: brings the stack up, checks the API reaches the database and the web app reaches the API, then takes it down again (if it was not already running). | ~1 min |

Both install missing dependencies themselves, stop at the first failure, and end with
`GATE <tier>: PASS|FAIL`. CI runs `./dc check full`; run it before opening a PR.

## Conventions

- API routes live under `/api`; the web app calls relative `/api/...` paths (Vite forwards them in
  development, nginx in the stack).
- `/api/health` must not touch the database; `/api/health/db` is the readiness check.
- Back-end style is whatever `ruff` enforces (`backend/pyproject.toml`); format with `ruff format`.
- Configuration comes from environment variables with working defaults; a fresh clone runs with no setup.

## Landmines

- `./dc down -v` is refused on purpose: several copies of this repo can run side by side, and the
  database volume belongs to this copy. Use `./dc reset` to wipe it.
- Host ports are variables (`WEB_PORT`, `API_PORT`, `DB_PORT`). Never hard-code one in `compose.yaml`.
- The starter test client warns that `httpx` with Starlette's test client is deprecated; harmless for now.
