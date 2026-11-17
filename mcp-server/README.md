# FillScore MCP server (read-only)

Lets an AI client that speaks the Model Context Protocol read an account's FillScore measurements of **past** executions. It reads
only: every tool makes one `GET` request to the FillScore API, and a test fails if any other method is ever sent. The numbers are the
ones FillScore's deterministic measurement code stored; the server computes, predicts and advises nothing.

## Tools

| Tool | What it returns |
|---|---|
| `fillscore_score` | The measured score (v2) with its version and integrity hash, and the cost against the modelled expectation, with its interval or "insufficient data" |
| `fillscore_orders_summary` | How orders ended, resting time of limit orders, shortfall totals per term in USD and basis points |
| `fillscore_exceptions` | Orders that met a stated rule, each with a one-line finding built from stored numbers, and their review state |
| `fillscore_order_replay` | One past order: fills, each cost term with the stored field it came from, and the public market-data files with SHA-256 |
| `fillscore_rankings` | Execution cost by symbol or hour; groups with fewer than 20 orders are "too few to tell" |
| `fillscore_venue_comparison` | The account's own fills across venues, matched by symbol and size bucket |

## Run it

```bash
cd mcp-server && npm ci
FILLSCORE_API_URL=https://<your FillScore API> FILLSCORE_TOKEN=<your access token> node server.mjs
# or try it on a public demo account, no token:
FILLSCORE_API_URL=https://<your FillScore API> FILLSCORE_DEMO_USER=demo-moderate node server.mjs
```

For an MCP client such as Claude Desktop, add a server entry that runs `node /path/to/mcp-server/server.mjs` with those environment
variables. Facts used to build this (read 2026-11-17): the MCP TypeScript SDK v1.x server API (`McpServer`, `registerTool`,
`StdioServerTransport`) from its documentation, https://github.com/modelcontextprotocol/typescript-sdk.

## Limits, stated plainly

- **The access token is short-lived.** FillScore has no long-lived personal API key yet, so a real account's token expires. Personal
  API keys are a new kind of credential and need Deepanshu's decision (listed in `docs/PROGRESS.md`). Demo accounts need no token.
- The URL must be `https` (plain `http` only for `localhost`), so the token is never sent in the clear.
- The server reads what the API returns; it does not hold data of its own and writes nothing.
- Numbers an AI client writes in its own words are the client's, not FillScore's; quote the tool output.
