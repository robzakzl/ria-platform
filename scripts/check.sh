#!/usr/bin/env bash
# The repo's checks. Run through ./dc: `./dc check quick` or `./dc check full`.
#   quick: back-end lint, format and unit tests; web type-check and unit tests.
#   full:  quick, plus the web production build and a smoke test of the whole stack in containers.
# Exits non-zero on the first failure; the last line is `GATE <tier>: PASS|FAIL`.
set -euo pipefail
cd "$(dirname "$0")/.."

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
  frontend_deps
  step "web type-check";  (cd frontend && npm run --silent typecheck)
  step "web tests";       (cd frontend && npm run --silent test)
}

smoke() {
  local was_up
  was_up=$(docker compose ps -q)
  step "stack up"
  docker compose up -d --build --wait
  [[ -n $was_up ]] || trap 'rc=$?; docker compose down; [[ $rc -eq 0 ]] && echo "GATE $tier: PASS" || echo "GATE $tier: FAIL"; exit $rc' EXIT
  step "API and database answer"
  curl -fsS "http://127.0.0.1:${API_PORT:-8000}/api/health/db"; echo
  step "web answers and reaches the API"
  curl -fsS "http://127.0.0.1:${WEB_PORT:-5173}/" | grep -q '<div id="root">'
  curl -fsS "http://127.0.0.1:${WEB_PORT:-5173}/api/health"; echo
}

quick
if [[ $tier == full ]]; then
  step "web production build"; (cd frontend && npm run --silent build)
  smoke
fi
