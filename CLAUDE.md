# Asterly — agent guide

An investment-adviser (RIA) platform at the starter-app stage: FastAPI API (`backend/`), React +
TypeScript web app (`frontend/`), PostgreSQL, all run locally by `compose.yaml` through `./dc`.

## Hard rules

- Run `./dc check quick` after a change and `./dc check full` before a PR; both must end `GATE …: PASS`.
  Never weaken, skip or delete a check to go green.
- Never hard-code a host port, compose project name or volume name; ports are `${VAR:-default}` in
  `compose.yaml`. Never run `docker compose down -v`; `./dc reset` is the only wipe.
- A fresh clone must build, run and test with no `.env` and no extra setup step. New configuration gets a
  working default.
- Never commit `.env` or a secret. A secret the code needs goes in the environment, with its name in
  `.env.example` and no value.
- Branch from `main`; deliver through a PR into `main`. Never push to `main`. Every merge to `main`
  deploys to production at once; there is no other environment.

## Router

| Topic | Read |
|---|---|
| Layout, run, test, conventions, landmines | [docs/development.md](docs/development.md) |
| Deployment (prod only): prod URLs, monthly cost, auto-deploy on merge to main, roll back, suspend and restart (prod is suspended), failed deploys, logs, known constraints, OIDC bootstrap stack, deploy role, GitHub role variable | [docs/deployment.md](docs/deployment.md) |
| How this repo's agent context is shaped (single home, pointers not copies) | `/usr/lib/jaahd/docs/policies/context-architecture.md` |
| Which agent instrumentation this stack warrants | `/usr/lib/jaahd/docs/policies/agentic-instrumentation.md` |
| Running several worktrees of this repo side by side (ports, stack names) | `/usr/lib/jaahd/docs/policies/worktree-pool-policy.md` |
