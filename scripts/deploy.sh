#!/usr/bin/env bash
# Deploys prod: scripts/deploy.sh prod <40-char commit sha> (prod is the only environment; the argument
# keeps the interface older commits' rollbacks use). Builds the API package, applies infra/app.yaml as the
# stack ria-prod (API + database), builds the web app against the API's URL, publishes it to GitHub Pages
# (branch gh-pages, folder prod/), then smoke-tests both. Exits 0 only when the smoke test passes. After a
# suspension (scripts/suspend.sh) it recreates the stack with the database restored from its snapshot.
# Runs in GitHub Actions with the prod OIDC deploy role and a GITHUB_TOKEN allowed to push
# gh-pages (docs/deployment.md); needs AWS CLI v2, Python 3.13, Node 24, git and curl. Never prints a
# secret: no `set -x`, and no secret is ever read here.
set -euo pipefail
cd "$(dirname "$0")/.."

env=${1:-}
sha=${2:-}
if [[ $env != prod ]] || [[ ! $sha =~ ^[0-9a-f]{40}$ ]]; then
  echo "usage: scripts/deploy.sh prod <40-char commit sha>" >&2
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
# A first create that failed leaves ROLLBACK_COMPLETE, which CloudFormation cannot update; the deploy
# role cannot delete stacks, so say what an administrator must do instead of failing obscurely.
status=$(aws cloudformation describe-stacks --stack-name "$stack" --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || echo NONE)
if [[ $status == ROLLBACK_COMPLETE ]]; then
  echo "stack $stack is in ROLLBACK_COMPLETE (its first create failed): an administrator must delete it," \
    "then re-run this deploy (docs/deployment.md, \"When a deploy fails\")" >&2
  exit 1
fi
# Creating the stack after a suspension (scripts/suspend.sh) restores the database from the newest
# suspension snapshot. Later deploys omit DbSnapshot, so the stack keeps the value it was created with.
restore=()
if [[ $status == NONE ]]; then
  snapshot=$(aws rds describe-db-cluster-snapshots --snapshot-type manual \
    --query "reverse(sort_by(DBClusterSnapshots[?starts_with(DBClusterSnapshotIdentifier, 'ria-$env-db-suspended-') && Status=='available'], &SnapshotCreateTime))[0].DBClusterSnapshotIdentifier" \
    --output text)
  if [[ -n $snapshot && $snapshot != None ]]; then
    echo "restoring the database from snapshot $snapshot"
    restore=("DbSnapshot=$snapshot")
  fi
fi
# A failed update rolls back by itself, and the previous version keeps serving.
aws cloudformation deploy --stack-name "$stack" --template-file build/app.packaged.yaml \
  --role-arn "$exec_role" \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND --no-fail-on-empty-changeset \
  --parameter-overrides EnvName="$env" GitSha="$sha" VpcId="$vpc" SubnetIds="$subnets" "${restore[@]}" \
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
printf '{"sha":"%s"}\n' "$sha" >frontend/dist/version.json
scripts/publish-pages.sh "$env" frontend/dist "chore(pages): deploy $env $sha"

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
  # The first accounts request creates and seeds the table (backend/app/accounts.py): expect >= 50.
  accounts=$(curl -fsS --max-time 35 "$api/api/accounts" 2>/dev/null |
    python3 -c 'import json, sys; print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0)
  # The first commissions request seeds 6 Monthly fees per account (backend/app/commissions.py).
  monthly=$(curl -fsS --max-time 35 "$api/api/commissions?commission_type=Monthly&page_size=1" \
    2>/dev/null | python3 -c 'import json, sys; print(json.load(sys.stdin)["total_count"])' \
    2>/dev/null || echo 0)
  page=$(curl -fsS --max-time 10 "$site/?smoke=$SECONDS" 2>/dev/null || true)
  page_ok=no
  [[ $page == *'<div id="root">'* && $page == *"/$name/$env/assets/"* ]] && page_ok=yes
  if [[ $db == "$want_db" && $cors == "$pages_origin" && $got_sha == "$sha" && $page_ok == yes ]] &&
    ((accounts >= 50 && monthly >= 300)); then
    break
  fi
  if ((SECONDS >= deadline)); then
    echo "smoke test failed: $api/api/health/db='$db' CORS allow-origin='$cors' accounts=$accounts" \
      "monthly commissions=$monthly" \
      "$site/version.json sha='$got_sha' web page ok=$page_ok" >&2
    exit 1
  fi
  sleep 10
done
echo "$api/api/health/db -> $db (CORS allows $cors)"
echo "$api/api/accounts -> $accounts accounts"
echo "$api/api/commissions -> $monthly Monthly fees"
echo "$site/version.json -> $got_sha"
echo "deployed $sha to $env: $site/"
if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then
  echo "Deployed \`$sha\` to **$env**: $site/ (API $api)" >>"$GITHUB_STEP_SUMMARY"
fi
