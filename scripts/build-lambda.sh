#!/usr/bin/env bash
# Builds the API's Lambda package into build/api: the back end's runtime dependencies as Linux arm64
# wheels for Python 3.13 (never x86 wheels; manylinux_2_28 suits the AL2023-based python3.13 runtime), backend/app/, and the handler infra/lambda/run.sh.
# Used by scripts/deploy.sh; needs pip, no AWS access.
set -euo pipefail
cd "$(dirname "$0")/.."

out=build/api
rm -rf -- build/api
mkdir -p "$out"

# The [project] dependencies from backend/pyproject.toml, one per line.
deps=$(python3 -c 'import tomllib; print("\n".join(tomllib.load(open("backend/pyproject.toml", "rb"))["project"]["dependencies"]))')
mapfile -t reqs <<<"$deps"

python3 -m pip install --quiet --disable-pip-version-check \
  --platform manylinux2014_aarch64 --platform manylinux_2_28_aarch64 --implementation cp --python-version 3.13 \
  --only-binary=:all: --target "$out" "${reqs[@]}"

cp -R backend/app "$out/app"
find "$out" -name __pycache__ -type d -prune -exec rm -rf {} +
install -m 0755 infra/lambda/run.sh "$out/run.sh"
echo "built $out ($(du -sh "$out" | cut -f1))"
