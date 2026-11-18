# Deploy runbook: keep CI as the gate

Why this file exists. On 2026-11-18 commit `6bfc283` reached production while one backend CI job was red. Two paths bypassed CI:

- A Render "Save, rebuild, and deploy" after an env change builds the newest commit, whether or not CI passed.
- Vercel deploys every push to `main`, whatever CI says.

The general setup guide is `docs/DEPLOY.md`. This file only covers the gate and the checks after a deploy.

## 1. Render (backend `fillscore-api`, ml-service `fillscore-ml`)

`render.yaml` sets `autoDeployTrigger: checksPass`. That setting works only for automatic deploys after a push.

After you change an environment variable in the Render dashboard:

1. Choose **Save and deploy**. Never choose **Save, rebuild, and deploy**.
2. Use **Save, rebuild, and deploy** only when you mean to ship the newest commit **and** that commit passed CI. Check first: the GitHub Actions run for that commit must be green (all jobs: `secrets`, `backend`, `frontend`, `mcp`, `ml-service`, `eval`, `e2e`).
3. If CI is red, do not deploy by hand. Fix the cause, push, wait for green.

(The names of the two Render buttons are as you reported them; they were not re-checked against Render's documentation.)

## 2. Vercel (frontend)

Vercel builds every push to `main`. The goal is that a production deployment is created but **not put on the production domain** until the CI jobs pass.

### Option A (recommended): Deployment Checks, GitHub provider. No code or workflow change.

Source: https://vercel.com/docs/deployment-checks (page last updated 2026-08-11, read 2026-11-18).

What the docs say it does: "When you add Deployment Checks to a project, Vercel will hold each production deployment until all required checks pass before assigning it to your custom production domains." The deployment is still built. The previous production deployment keeps serving until the checks pass. Plain GitHub Actions jobs are supported: "Import GitHub Actions workflow results as Deployment Checks."

Steps in the Vercel dashboard (the docs give this sequence; button names are as written there):

1. Project, **Settings**, **Git**: confirm the project is linked to the GitHub repository through "Vercel for GitHub".
2. Project, **Settings**, **Environments**, **Production**: confirm automatic aliasing for production is turned on.
3. Project, **Settings**, **Build and Deployment**, section **Deployment Checks** (`#deployment-checks`). Select **Add Checks**.
4. Choose the provider **GitHub**. Search for and select these GitHub Actions jobs, one at a time: `backend`, `frontend`, `mcp`, `ml-service`, `eval`, `e2e`, `secrets`. (These are the job ids in `.github/workflows/ci.yml`. The workflow gives no separate display name, so GitHub shows the id. If the search shows different spellings, pick what the "Checks" list of a recent commit on GitHub shows.)
5. Save. Push to `main`. In the Vercel deployment list the new production deployment stays "not promoted" until the jobs pass, then it is aliased automatically.
6. Test it once on purpose: push a commit with a failing job (or re-run a job and cancel it) and confirm the deployment is not promoted. **Force Promote** on the deployment page bypasses the checks; use it only deliberately.

Caveats from the docs:

- Check names come from the job names. If you rename a job in `ci.yml`, update the list in step 4.
- Avoid the same job name in several workflows (check runs collide). There is only one workflow now.
- Our CI runs on `push` to `main`, so no `repository_dispatch` helper action is needed.

**Not stated in the docs, so not claimed here:**

- whether Deployment Checks is available on the **Hobby** plan. The docs have no plan table for it. The changelog says only "available for all projects connected to GitHub repositories" and "available to every team". If **Add Checks** is missing or locked in the dashboard, use Option B.
- what the deployment looks like when a check fails (it is not promoted, by implication only).
- how a `frontend/` Root Directory interacts with it.

### Option B (fallback): turn Git deploys off for production and deploy from GitHub Actions after CI

Sources: https://vercel.com/docs/git/external-pipelines (updated 2026-11-17), https://vercel.com/docs/cli/deploying-from-cli, https://vercel.com/docs/project-configuration/git-configuration. Use it only if Option A is not available on your plan.

What changes (nothing is applied; the files are proposals in `.work/proposed/`):

1. `.work/proposed/vercel-deploy.yml` becomes `.github/workflows/vercel-deploy.yml`. It runs only after the `CI` workflow succeeded on `main`, then runs `vercel pull --yes --environment=production`, `vercel build --prod`, `vercel deploy --prebuilt --prod`.
2. `.work/proposed/vercel.json` becomes `frontend/vercel.json` (or the project's Root Directory; the docs do not say where it must sit in a monorepo). It sets `git.deploymentEnabled` to `{"main": false}`: production pushes no longer deploy by themselves; preview deployments of other branches stay on.
3. In GitHub: Settings, Secrets and variables, Actions, add three repository secrets: `VERCEL_TOKEN` (create at https://vercel.com/account/tokens; scope it to this project if the page offers it), `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (both in `.vercel/project.json` after `vercel link` on your machine; do not commit that folder). Add no value to any file.
4. Order of work: add the secrets, merge the workflow, check that one deploy from Actions works, only then merge `vercel.json`. Doing it the other way round leaves production with no deploy path.

Not stated in the docs: where `vercel.json` must sit for a `frontend/` Root Directory, whether `vercel pull` and `vercel build` use the Root Directory saved in the project, and whether a CLI deploy avoids the Hobby limit on private organisation repositories (not relevant if the repository is under a personal account).

## 3. After every deploy: smoke test

Run it with the commit you expect to be live:

```bash
scripts/smoke_prod.sh https://<fillscore-api>.onrender.com https://<fillscore-ml>.onrender.com https://<vercel-site> "$(git rev-parse HEAD)"
```

- The fourth argument is the expected commit. A service whose commit differs prints FAIL. The three services must all report the same commit.
- The script prints one PASS or FAIL line per check, no secret, and exits 1 on any failure. The first call after a sleep can take about a minute.
- A deploy is finished only when the script shows all PASS **and** the commit lines equal the commit you meant to ship. If a commit line is old, the deploy did not finish or the wrong button was used (section 1).
- Also look at the GitHub Actions run of that commit. A green smoke test does not replace green CI.
