# Contributing to FillScore

Thanks for helping. FillScore is small enough that the rules fit on one page, and they matter more
than the style guide.

## The product rules

A change that breaks one of these will not be merged, however good the code is.

1. **Audit the past, never predict.** No signals, forecasts, or pre-trade estimates. If a feature
   would tell a user what a future trade will do, it is out of scope.
2. **Language models may label, argue, and explain. They never originate a number.** Every numeric
   value a user sees traces to a deterministic computation (the Grounding Contract). Do not hardcode
   a market claim such as "spreads are 2x wider at night" into copy; compute it or leave it out.
3. **Council output is never financial advice.** Copy must not imply otherwise.
4. **Provenance is immutable.** `dataSource` (`synthetic-demo` or `real-user`) is set once and
   enforced by the schema.
5. **Secrets come from the environment only.** Never hardcode, print, or commit a credential, even
   temporarily. Do not paste `.env` contents into issues or pull requests.
6. **Correlation, never causation.** Say "coincided with", not "caused".

## Getting set up

You need Node.js 20+, Python 3.11+, and a MongoDB you can write to (Atlas free tier works). The Agent
Council needs a Groq API key; everything else runs without one.

```bash
git clone https://github.com/DeepanshuOP/FillScore.git
cd FillScore

# backend
cd backend && cp .env.example .env     # fill in the values, never commit .env
npm ci

# frontend
cd ../frontend && npm ci

# ml-service
cd ../ml-service && python3 -m pip install -r requirements.txt
```

`docker compose up --build` starts the backend and ml-service from their `.env` files.

## Running the checks

Run all of these before you open a pull request. CI runs the same ones.

```bash
# backend (use --no-file-parallelism; each file starts its own in-memory MongoDB)
cd backend
JWT_ACCESS_SECRET=a JWT_REFRESH_SECRET=b GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=x \
GITHUB_CLIENT_ID=x GITHUB_CLIENT_SECRET=x MONGODB_URI=mongodb://127.0.0.1:27017/t PORT=3001 \
BINANCE_API_KEY=k BINANCE_API_SECRET=s ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
npm test -- --no-file-parallelism
npx tsc --noEmit

# frontend: all three, the build and the typecheck catch bugs the tests structurally cannot
cd ../frontend
npx vitest run
npx tsc --noEmit
npm run build

# ml-service
cd ../ml-service
JWT_ACCESS_SECRET=a python3 -m pytest -m "not integration"
```

The backend tests download a MongoDB binary the first time. If your network blocks that, point
`MONGOMS_SYSTEM_BINARY` at a local `mongod` and they will use it instead.

On PowerShell, set the same variables with `$env:NAME="value"` before running the commands.

## How we work

- **Tests first, from hand-computed fixtures.** Write the failing test, watch it fail for the right
  reason, then make it pass. When a test and the code disagree, work out which one is wrong. Do not
  edit a fixture to make a number fit, and do not mock the thing you are testing.
- **Verify before you say it works.** "It did not crash" is not proof. Read the actual output. For
  Council runs, check the call count, the persisted document, and the real text, because a run that
  hits a rate limit can silently fall back to default verdicts that look plausible.
- **Keep changes surgical.** One pull request, one testable change. Do not mix unrelated work.
- **Do not run destructive scripts.** `npm run seed` and other scripts under `backend/src/scripts`
  overwrite data. Never point them at a database you care about.
- **Documentation is checked.** `ARCHITECTURE.md` has a route table that a test compares with the
  running app. After adding or removing a route, run `npm run docs:routes` in `backend/` and update
  the table.
- **Commit messages** are one short plain line that says what changed, for example
  `reject cross-site refresh requests by checking Origin`. No prefixes or changelog formatting.

## Reporting problems

Bugs and ideas go in GitHub issues. Security problems do not: see [SECURITY.md](SECURITY.md).
