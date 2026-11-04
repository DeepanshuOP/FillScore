---
paths: ["backend/**"]
---

# Backend (Express, port 3001)

Node 20 via nvm. Tests use mongodb-memory-server against a local mongod.

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
# MONGOMS_SYSTEM_BINARY= overrides a Windows mongod path in backend/.env.test
cd backend && MONGOMS_SYSTEM_BINARY= JWT_ACCESS_SECRET=test1 JWT_REFRESH_SECRET=test2 \
  GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=x GITHUB_CLIENT_ID=x GITHUB_CLIENT_SECRET=x \
  npm test -- --no-file-parallelism && npx tsc --noEmit
```

Gotchas:
- Run the whole tier and read the summary line; typecheck too.
- Mongo stores camelCase; `trades.executedAt` is a native datetime; use `feeUsd` for USD fee math.
- Never run the seed, index, purge or backfill scripts in `backend/src/scripts` (see CLAUDE.md).
- The route table in `ARCHITECTURE.md` is test-enforced: a new route needs a table row.
