#!/usr/bin/env bash
# Publishes a directory as the web app of one environment: scripts/publish-pages.sh <env> <dir> <message>.
# Replaces the folder <env>/ of the gh-pages branch, which GitHub Pages serves, with <dir>'s contents and
# pushes; other folders are untouched. Used by scripts/deploy.sh (the app) and scripts/suspend.sh (the
# "paused" page). Needs git with push access to origin.
set -euo pipefail
cd "$(dirname "$0")/.."

env=${1:?usage: scripts/publish-pages.sh <env> <dir> <message>}
src=$(cd "${2:?usage: scripts/publish-pages.sh <env> <dir> <message>}" && pwd)
msg=${3:?usage: scripts/publish-pages.sh <env> <dir> <message>}

pages=build/pages
git worktree remove --force "$pages" 2>/dev/null || true
rm -rf -- build/pages
if git ls-remote --exit-code --heads origin gh-pages >/dev/null; then
  git fetch --quiet --depth 1 origin gh-pages
  git worktree add --quiet --detach "$pages" FETCH_HEAD
else
  git worktree add --quiet --detach "$pages" HEAD
  (cd "$pages" && git checkout --quiet --orphan "pages-$env-$$" && git rm -rfq .)
fi
(
  cd "$pages"
  # A CI runner has no git identity; commits and the retry's rebase need one. A person keeps their own.
  if [[ -n ${GITHUB_ACTIONS:-} ]]; then
    export GIT_AUTHOR_NAME="github-actions[bot]" GIT_COMMITTER_NAME="github-actions[bot]"
    export GIT_AUTHOR_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"
    export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
  fi
  rm -rf -- "./$env"
  mkdir -p "$env"
  cp -R "$src/." "$env/"
  touch .nojekyll
  git add -A
  if git diff --cached --quiet; then echo "web app unchanged"; else git commit --quiet -m "$msg"; fi
  # Another push to gh-pages may land first; this touches only its own folder, so rebase and retry.
  for attempt in 1 2 3 4 5; do
    git push --quiet origin HEAD:refs/heads/gh-pages && break
    ((attempt < 5)) || { echo "could not push gh-pages" >&2; exit 1; }
    git fetch --quiet origin gh-pages && git rebase --quiet FETCH_HEAD
  done
)
git worktree remove --force "$pages"
