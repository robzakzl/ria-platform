#!/usr/bin/env bash
# Deploys one environment: scripts/deploy.sh <dev|prod> <40-char commit sha>
# Builds the API package, applies infra/app.yaml as the stack ria-<env> (API + database), builds the web
# app against the API's URL, publishes it to GitHub Pages (branch gh-pages, folder <env>/), then
# smoke-tests both. Exits 0 only when the smoke test passes.
# Runs in GitHub Actions with the environment's OIDC deploy role and a GITHUB_TOKEN allowed to push
# gh-pages (docs/deployment.md); needs AWS CLI v2, Python 3.13, Node 24, git and curl. Never prints a
# secret: no `set -x`, and no secret is ever read here.
set -euo pipefail
cd "$(dirname "$0")/.."

env=${1:-}
sha=${2:-}
if [[ $env != dev && $env != prod ]] || [[ ! $sha =~ ^[0-9a-f]{40}$ ]]; then
  echo "usage: scripts/deploy.sh <dev|prod> <40-char commit sha>" >&2
  exit 2
fi
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 AWS_PAGER=""
stack=ria-$env
repo=${GITHUB_REPOSITORY:-robzakzl/ria-platform}
owner=${repo%%/*}
name=${repo#*/}
pages_origin="https://${owner,,}.github.io"
site="$pages_origin/$name/$env"
step() { echo "==> $*"; }

step "AWS identity"
aws sts get-caller-identity --query Arn --output text

step "build API package"
scripts/build-lambda.sh

step "read bootstrap outputs and network"
bootstrap_output() {
  aws cloudformation describe-stacks --stack-name ria-bootstrap \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
artifacts=$(bootstrap_output ArtifactBucket)
exec_role=$(bootstrap_output "CfnExecRoleArn${env^}")
vpc=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
# Default subnets, minus use1-az3, where Lambda cannot run.
subnets=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$vpc" Name=default-for-az,Values=true \
  --query "Subnets[?AvailabilityZoneId!='use1-az3'].SubnetId" --output text | tr '\t' ',')
[[ -n $artifacts && $artifacts != None && -n $exec_role && $exec_role != None && -n $vpc && $vpc != None && -n $subnets ]] || {
  echo "missing bootstrap output, default VPC or subnets" >&2
  exit 1
}
echo "artifacts=$artifacts exec_role=$exec_role vpc=$vpc subnets=$subnets"

step "package template"
aws cloudformation package --template-file infra/app.yaml \
  --s3-bucket "$artifacts" --s3-prefix "$env/$sha" --output-template-file build/app.packaged.yaml

step "deploy stack $stack"
# A failed update rolls back by itself, and the previous version keeps serving.
aws cloudformation deploy --stack-name "$stack" --template-file build/app.packaged.yaml \
  --role-arn "$exec_role" \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND --no-fail-on-empty-changeset \
  --parameter-overrides EnvName="$env" GitSha="$sha" VpcId="$vpc" SubnetIds="$subnets" \
  --tags GitSha="$sha"

stack_output() {
  aws cloudformation describe-stacks --stack-name "$stack" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
api=$(stack_output ApiUrl)
api=${api%/}
[[ $api == https://* ]] || { echo "stack $stack has no ApiUrl output" >&2; exit 1; }
echo "api=$api site=$site"

step "build web app against $api"
(cd frontend && npm ci --no-audit --no-fund &&
  VITE_API_BASE_URL="$api" npm run --silent build -- --base "/$name/$env/")

step "publish web app to GitHub Pages ($site/)"
# The gh-pages branch holds one folder per environment; a deploy replaces only its own folder.
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
  # The runner has no git identity; commits and the retry's rebase need one.
  export GIT_AUTHOR_NAME="github-actions[bot]" GIT_COMMITTER_NAME="github-actions[bot]"
  export GIT_AUTHOR_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"
  export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
  rm -rf -- "./$env"
  mkdir -p "$env"
  cp -R ../../frontend/dist/. "$env/"
  printf '{"sha":"%s"}\n' "$sha" >"$env/version.json"
  touch .nojekyll
  git add -A
  git commit --quiet -m "deploy $env $sha" || echo "web app unchanged"
  # A dev and a prod deploy may push at once; they touch different folders, so rebase and retry.
  for attempt in 1 2 3 4 5; do
    git push --quiet origin HEAD:refs/heads/gh-pages && break
    ((attempt < 5)) || { echo "could not push gh-pages" >&2; exit 1; }
    git fetch --quiet origin gh-pages && git rebase --quiet FETCH_HEAD
  done
)
git worktree remove --force "$pages"

step "smoke test $site/ and $api"
# GitHub Pages publishes a push within a minute or two; its CDN caches ~10 minutes, so the checks
# add a query string to fetch fresh copies.
want_db='{"status":"ok","database":"ok"}'
deadline=$((SECONDS + 300))
while :; do
  db=$(curl -fsS --max-time 35 "$api/api/health/db" 2>/dev/null || true)
  cors=$(curl -fsS --max-time 10 -o /dev/null -D - -H "Origin: $pages_origin" "$api/api/health" 2>/dev/null |
    tr -d '\r' | sed -n 's/^access-control-allow-origin: *//Ip' || true)
  got_sha=$(curl -fsS --max-time 10 "$site/version.json?smoke=$SECONDS" 2>/dev/null |
    python3 -c 'import json, sys; print(json.load(sys.stdin)["sha"])' 2>/dev/null || true)
  page=$(curl -fsS --max-time 10 "$site/?smoke=$SECONDS" 2>/dev/null || true)
  page_ok=no
  [[ $page == *'<div id="root">'* && $page == *"/$name/$env/assets/"* ]] && page_ok=yes
  if [[ $db == "$want_db" && $cors == "$pages_origin" && $got_sha == "$sha" && $page_ok == yes ]]; then
    break
  fi
  if ((SECONDS >= deadline)); then
    echo "smoke test failed: $api/api/health/db='$db' CORS allow-origin='$cors'" \
      "$site/version.json sha='$got_sha' web page ok=$page_ok" >&2
    exit 1
  fi
  sleep 10
done
echo "$api/api/health/db -> $db (CORS allows $cors)"
echo "$site/version.json -> $got_sha"
echo "deployed $sha to $env: $site/"
if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then
  echo "Deployed \`$sha\` to **$env**: $site/ (API $api)" >>"$GITHUB_STEP_SUMMARY"
fi
