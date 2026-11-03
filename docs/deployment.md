# Deployment

How ria-platform reaches AWS (region `us-east-1`). In this doc `<env>` is `dev` (deployed from
`develop`) or `prod` (deployed from `main`), and `<account id>` is your 12-digit AWS account id (see
[Apply or update it](#apply-or-update-it)). Everything in AWS is declared in
CloudFormation templates under `infra/`. GitHub Actions applies them, with one exception: the bootstrap
stack below, which a person applies by hand.

## One-time bootstrap (OIDC deploy roles)

### What it holds

`infra/bootstrap.yaml` is the CloudFormation stack `ria-bootstrap`. It holds what GitHub Actions needs
before it can deploy anything:

| Resource | Name | Purpose |
|---|---|---|
| GitHub OIDC identity provider | `token.actions.githubusercontent.com` | Lets a GitHub Actions run exchange its signed identity token for short-lived AWS credentials, so no AWS access key is stored in GitHub. |
| Deploy role, dev | `ria-gh-deploy-dev` | Assumed by GitHub Actions only from a workflow run on `develop` of `robzakzl/ria-platform`. Can change the `ria-dev` stack, upload to its own buckets and artifact prefix, invalidate the CDN cache and read the function logs. |
| Deploy role, prod | `ria-gh-deploy-prod` | The same for `main` and the `ria-prod` stack. A `develop` run can never get prod credentials. |
| CloudFormation execution roles | `ria-cfn-exec-dev`, `ria-cfn-exec-prod` | Assumed by CloudFormation only. They create the app resources, which are all named `ria-<env>-*`. The deploy role can only hand its own environment's execution role to CloudFormation. |
| Role permissions boundaries | `ria-dev-boundary`, `ria-prod-boundary` | The ceiling for every IAM role the app stack creates (see below). |
| Artifact bucket | `ria-artifacts-<account id>` | Packaged deploy artifacts under `dev/` and `prod/`. Private, encrypted, objects expire after 30 days. |

Its outputs are `ArtifactBucket`, `DeployRoleArnDev`, `DeployRoleArnProd`, `CfnExecRoleArnDev` and
`CfnExecRoleArnProd`.

The trust policy pins each deploy role to one exact OIDC subject: `repo:robzakzl/ria-platform:ref:refs/heads/develop`
(dev) or `...:ref:refs/heads/main` (prod), audience `sts.amazonaws.com`. A deploy job therefore must not
set a GitHub `environment:` key, and nobody may customise the repo's OIDC subject claim template: either
changes the subject, and the role then refuses the token.

### Why it is applied by hand, once

GitHub Actions authenticates through the deploy role, so the role must exist before any workflow can
run. Someone with administrator access applies this stack from their own machine. After that, change it
only through a PR to `infra/bootstrap.yaml`, and re-apply it by hand with the same command once that PR
has merged.

### Apply or update it

You need the AWS CLI v2, signed in to the account as an administrator, for example with
`aws configure` or `aws sso login`. If you signed in with a named profile, run `export AWS_PROFILE=<profile>`
first, where `<profile>` is that profile's name from `~/.aws/config`. Check which account you are in:

```bash
aws sts get-caller-identity --query Account --output text
```

That prints the 12-digit account id. In the rest of this doc, `<account id>` means that number. From the
repo root, apply or update the stack:

```bash
aws cloudformation deploy \
  --region us-east-1 \
  --stack-name ria-bootstrap \
  --template-file infra/bootstrap.yaml \
  --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
  --no-fail-on-empty-changeset
```

`CAPABILITY_NAMED_IAM` is needed because the stack creates IAM roles with fixed names.
`CAPABILITY_AUTO_EXPAND` is needed because the template uses the `AWS::LanguageExtensions` transform
(`Fn::ForEach` declares the dev and prod roles from one definition). With
`--no-fail-on-empty-changeset`, a re-run with no changes prints `No changes to deploy` and still exits 0.

If the first apply fails because the provider `token.actions.githubusercontent.com` already exists, the
account already has a GitHub OIDC provider (AWS allows one per URL). Ask whoever owns it whether it is
still used; if not, delete it (`aws iam list-open-id-connect-providers` lists it). The failed create leaves
the stack in `ROLLBACK_COMPLETE`, which cannot be updated, so delete the stack before applying again:

```bash
aws cloudformation delete-stack --region us-east-1 --stack-name ria-bootstrap
aws cloudformation wait stack-delete-complete --region us-east-1 --stack-name ria-bootstrap
```

Read the outputs:

```bash
aws cloudformation describe-stacks --region us-east-1 --stack-name ria-bootstrap \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
```

### Give GitHub the role ARNs

The workflows read the role ARNs from two repository **variables**, not secrets: an ARN is not a
credential. In GitHub, open the repo's **Settings → Secrets and variables → Actions → Variables** tab, choose
**New repository variable**, and create:

| Variable name | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN_DEV` | the `DeployRoleArnDev` output, `arn:aws:iam::<account id>:role/ria-gh-deploy-dev` |
| `AWS_DEPLOY_ROLE_ARN_PROD` | the `DeployRoleArnProd` output, `arn:aws:iam::<account id>:role/ria-gh-deploy-prod` |

Never add `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` to GitHub. The OIDC roles replace them.

### Check it

```bash
# Trust: each role names exactly one branch of this repo.
aws iam get-role --role-name ria-gh-deploy-dev --query Role.AssumeRolePolicyDocument
aws iam get-role --role-name ria-gh-deploy-prod --query Role.AssumeRolePolicyDocument
# The role may use the SAM and LanguageExtensions transforms (repeat with ria-gh-deploy-prod).
aws iam get-role-policy --role-name ria-gh-deploy-dev --policy-name deploy \
  --query "PolicyDocument.Statement[?Sid=='UseTransforms'].Resource"
```

The first two print a condition with `token.actions.githubusercontent.com:sub` set to the branch. The
last prints the two `arn:aws:cloudformation:us-east-1:aws:transform/...` ARNs. Do not test the transform
grant with `aws iam simulate-principal-policy`: the simulator cannot evaluate AWS-owned transform ARNs
and answers `implicitDeny` even for a policy that allows every resource. The real test is the first
deploy, which fails with `not authorized to perform: cloudformation:CreateChangeSet on resource:
...transform/...` if the grant is missing.

### Permissions, and what to do when one is missing

The deploy and execution roles list their actions one by one; there is no `*` action and no
`AdministratorAccess`. Writes are limited to `ria-<env>-*` resources where AWS can scope them by name.
Read-only `Describe` calls, and the CloudFront, security-group, network-interface and EC2 tag actions,
apply account-wide, because those resources get generated ids rather than names. So a `develop` deploy is not walled off from prod's
CDN distribution and security groups at the IAM level; scoping those by resource tag is a known follow-up.

The execution role may create an IAM role, or add permissions to one, only if that role carries the permissions boundary
`arn:aws:iam::<account id>:policy/ria-<env>-boundary`. So every role in an app template must set it,
for example on a SAM function, where `EnvName` is the app template's own `dev`/`prod` parameter:

```yaml
PermissionsBoundary: !Sub arn:aws:iam::${AWS::AccountId}:policy/ria-${EnvName}-boundary
```

The boundary caps those roles at writing their own Lambda logs, using VPC network interfaces, reading
`ria-<env>/*` secrets, using `ria-<env>-*` buckets and sending X-Ray traces. Without it, anyone who could merge to `develop`
could create an administrator role.

If a deploy fails with `AccessDenied`, add only the action the error names to the right role (or the
boundary) in `infra/bootstrap.yaml`, merge the PR, and re-apply the stack as above.
