#!/usr/bin/env bash
# The repo's checks. Run through ./dc: `./dc check quick` or `./dc check full`.
#   quick: back-end lint, format and unit tests; CloudFormation lint (offline); web type-check and unit tests.
#   full:  quick, plus the web production build, a smoke test of the whole stack in containers, and the
#          back-end tests that need PostgreSQL (TEST_DATABASE_URL, the stack's database).
# Exits non-zero on the first failure; the last line is `GATE <tier>: PASS|FAIL`.
set -euo pipefail
cd "$(dirname "$0")/.."
# Ports and stack name come from this worktree's .env, which ./dc loads; always run through it.
[[ -n ${DC_WRAPPED:-} ]] || exec ./dc check "$@"

tier=${1:-}
if [[ $tier != quick && $tier != full ]]; then
  echo "usage: ./dc check quick|full" >&2
  exit 2
fi
trap 'rc=$?; [[ $rc -eq 0 ]] && echo "GATE $tier: PASS" || echo "GATE $tier: FAIL"; exit $rc' EXIT

step() { echo "==> $*"; }

backend_deps() {
  local stamp=backend/.venv/.installed
  if [[ ! -f $stamp || backend/pyproject.toml -nt $stamp ]]; then
    step "install back-end dependencies"
    python3 -m venv backend/.venv
    backend/.venv/bin/pip install -q -e "backend[dev]"
    touch "$stamp"
  fi
}

frontend_deps() {
  if [[ ! -f frontend/node_modules/.package-lock.json || frontend/package-lock.json -nt frontend/node_modules/.package-lock.json ]]; then
    step "install web dependencies"
    (cd frontend && npm ci --no-audit --no-fund)
  fi
}

quick() {
  backend_deps
  step "back-end lint";   (cd backend && .venv/bin/ruff check .)
  step "back-end format"; (cd backend && .venv/bin/ruff format --check .)
  step "back-end tests";  (cd backend && .venv/bin/pytest -q)
  step "infra lint";      backend/.venv/bin/cfn-lint infra/*.yaml
  frontend_deps
  step "web type-check";  (cd frontend && npm run --silent typecheck)
  step "web tests";       (cd frontend && npm run --silent test)
}

finish() {
  local rc=$?
  if [[ -n ${started:-} ]]; then
    # Stop only what this check started; anything already running stays up.
    # shellcheck disable=SC2086
    if [[ -z $before ]]; then docker compose down || true; else docker compose rm -fs $started || true; fi
  fi
  [[ $rc -eq 0 ]] && echo "GATE $tier: PASS" || echo "GATE $tier: FAIL"
  exit $rc
}

smoke() {
  local all page
  before=$(docker compose ps --services --status running | sort)
  all=$(docker compose config --services | sort)
  started=$(comm -23 <(echo "$all") <(echo "$before") | tr '\n' ' ')
  trap finish EXIT
  step "stack up"
  docker compose up -d --build --wait
  step "API and database answer"
  curl -fsS "http://127.0.0.1:${API_PORT:-8000}/api/health/db"; echo
  step "web answers and reaches the API"
  page=$(curl -fsS "http://127.0.0.1:${WEB_PORT:-5173}/")
  [[ $page == *'<div id="root">'* ]] || { echo "web page is missing the app root" >&2; exit 1; }
  curl -fsS "http://127.0.0.1:${WEB_PORT:-5173}/api/health"; echo
  step "accounts are stored and seeded"
  curl -fsS "http://127.0.0.1:${WEB_PORT:-5173}/api/accounts" |
    python3 -c 'import json, sys; n = len(json.load(sys.stdin)); print(n, "accounts"); sys.exit(n < 50)'
  step "back-end tests against PostgreSQL"
  (cd backend && TEST_DATABASE_URL="postgresql://${POSTGRES_USER:-ria}:${POSTGRES_PASSWORD:-ria}@127.0.0.1:${DB_PORT:-5432}/${POSTGRES_DB:-ria}" \
    .venv/bin/pytest -q tests/test_accounts.py)
}

quick
if [[ $tier == full ]]; then
  step "web production build"; (cd frontend && npm run --silent build)
  smoke
fi
