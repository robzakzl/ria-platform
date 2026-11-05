#!/usr/bin/env bash
# Suspends an environment so it costs nothing to run: scripts/suspend.sh prod. Replaces the web app with
# the "paused" page (infra/paused/), deletes the database with a final snapshot named
# ria-<env>-db-suspended-<UTC time>, deletes the stack ria-<env> (API, secret, logs, network rules), and
# keeps only the newest suspension snapshot. The bootstrap stack stays. A deploy restores everything from
# the snapshot (docs/deployment.md, "Suspend and restart"). Set the repo variable PROD_SUSPENDED to true
# BEFORE running it, or the next merge recreates the environment.
# Run by an administrator from their own machine: AWS CLI v2 signed in to the account, and git with push
# access to origin. Safe to re-run, also mid-deletion: steps already done are skipped, steps in progress
# are waited for. Never prints a secret.
set -euo pipefail
cd "$(dirname "$0")/.."

env=${1:-}
[[ $env == prod ]] || { echo "usage: scripts/suspend.sh prod" >&2; exit 2; }
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 AWS_PAGER=""
stack=ria-$env cluster=ria-$env-db instance=ria-$env-db-1
step() { echo "==> $*"; }

# Prints a resource's status, or "absent" only when AWS says it does not exist; any other error (expired
# credentials, throttling) stops the script rather than being mistaken for "already deleted".
rds_status() { # <cluster|instance> <id>
  local out
  if out=$(aws rds "describe-db-$1s" "--db-$1-identifier" "$2" \
    --query "DB${1^}s[0].Status" --output text 2>&1); then
    echo "$out"
  elif [[ $out == *NotFound* ]]; then
    echo absent
  else
    echo "$out" >&2
    return 1
  fi
}

step "AWS identity"
aws sts get-caller-identity --query Arn --output text

# A restart needs the deploy role's snapshot permissions (infra/bootstrap.yaml, FindDbSnapshot): without
# them only an administrator could bring the environment back, so refuse to suspend.
deploy_role=ria-gh-deploy-$env
policies=$(aws iam list-role-policies --role-name "$deploy_role" --query PolicyNames --output text |
  tr '\t' '\n' |
  while read -r policy; do aws iam get-role-policy --role-name "$deploy_role" --policy-name "$policy"; done)
[[ $policies == *DescribeDBClusterSnapshots* ]] ||
  { echo "$deploy_role cannot find snapshots: apply infra/bootstrap.yaml first (docs/deployment.md)" >&2; exit 1; }

# First, so visitors see the notice instead of errors while the API and database go away.
step "publish the paused page"
scripts/publish-pages.sh "$env" infra/paused "chore(pages): suspend $env"

cluster_status=$(rds_status cluster "$cluster")
if [[ $cluster_status != absent ]]; then
  if [[ $cluster_status != deleting ]]; then
    snap=$cluster-suspended-$(date -u +%Y%m%d%H%M)
    step "delete database $cluster, keeping the final snapshot $snap"
    aws rds modify-db-cluster --db-cluster-identifier "$cluster" --no-deletion-protection \
      --apply-immediately >/dev/null
    instance_status=$(rds_status instance "$instance")
    if [[ $instance_status != absent ]]; then
      [[ $instance_status == deleting ]] ||
        aws rds delete-db-instance --db-instance-identifier "$instance" >/dev/null
      aws rds wait db-instance-deleted --db-instance-identifier "$instance"
    fi
    aws rds delete-db-cluster --db-cluster-identifier "$cluster" --final-db-snapshot-identifier "$snap" \
      >/dev/null
  fi
  step "wait for $cluster to be deleted"
  aws rds wait db-cluster-deleted --db-cluster-identifier "$cluster"
else
  echo "database $cluster already deleted"
fi

suspension_snapshots() { # [status filter], newest first
  aws rds describe-db-cluster-snapshots --snapshot-type manual \
    --query "reverse(sort_by(DBClusterSnapshots[?starts_with(DBClusterSnapshotIdentifier, '$cluster-suspended-')${1:-}], &SnapshotCreateTime))[].DBClusterSnapshotIdentifier" \
    --output text | tr '\t' '\n' | grep -v '^None$' || true
}
keep=$(suspension_snapshots | head -n 1)
[[ -n $keep ]] || { echo "no suspension snapshot of $cluster: stopping" >&2; exit 1; }
step "wait for snapshot $keep"
aws rds wait db-cluster-snapshot-available --db-cluster-snapshot-identifier "$keep"

if aws cloudformation describe-stacks --stack-name "$stack" >/dev/null 2>&1; then
  step "delete stack $stack"
  aws cloudformation delete-stack --stack-name "$stack"
  if ! aws cloudformation wait stack-delete-complete --stack-name "$stack"; then
    # The database is gone by now; if CloudFormation trips over it, delete the rest without it. Never
    # retain a database that still exists: it would keep billing outside any stack.
    [[ $(rds_status cluster "$cluster") == absent ]] ||
      { echo "stack delete failed and $cluster still exists: stopping" >&2; exit 1; }
    echo "stack delete failed; retrying without the database resources" >&2
    aws cloudformation delete-stack --stack-name "$stack" --retain-resources DbCluster DbInstance
    aws cloudformation wait stack-delete-complete --stack-name "$stack"
  fi
else
  echo "stack $stack already deleted"
fi

step "keep only the newest suspension snapshot ($keep)"
for old in $(suspension_snapshots " && Status=='available'"); do
  [[ $old == "$keep" ]] && continue
  aws rds delete-db-cluster-snapshot --db-cluster-snapshot-identifier "$old" >/dev/null
  echo "deleted $old"
done

echo "suspended $env; restore from $keep with a deploy (docs/deployment.md, \"Suspend and restart\")"
