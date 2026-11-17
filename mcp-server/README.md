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

## The scorecard as an MCP App

In a client that supports MCP Apps, `fillscore_score` also shows an interactive card inside the conversation: the grade, the score band, the
counts, each component, the cost against the modelled expectation (or "insufficient data"), and the integrity hash. The card is a view of the
tool's own result. It makes no request, loads nothing from the network (the server declares no content-security-policy origins, so the host
keeps its closed default), renders text only, and accepts messages only from the window that embeds it. A client without the extension shows
the tool's text as before. Facts used (MCP Apps specification 2026-01-26, read 2026-11-18): the resource is `ui://fillscore/scorecard.html`
with MIME type `text/html;profile=mcp-app`, the tool names it in `_meta.ui.resourceUri`, and the page speaks the specification's
`ui/initialize`, `ui/notifications/initialized` and `ui/notifications/tool-result` messages over `postMessage`.
Not yet tried in a real client (none was available to the author); the protocol and the page are tested against the specification's message
shapes with a fake host.

## Run it

```bash
cd mcp-server && npm ci
FILLSCORE_API_URL=https://<your FillScore API> FILLSCORE_API_KEY=<your personal API key> node server.mjs
# or try it on a public demo account, no token:
FILLSCORE_API_URL=https://<your FillScore API> FILLSCORE_DEMO_USER=demo-moderate node server.mjs
```

For an MCP client such as Claude Desktop, add a server entry that runs `node /path/to/mcp-server/server.mjs` with those environment
variables. Facts used to build this (read 2026-11-17): the MCP TypeScript SDK v1.x server API (`McpServer`, `registerTool`,
`StdioServerTransport`) from its documentation, https://github.com/modelcontextprotocol/typescript-sdk.

## Limits, stated plainly

- **Personal API keys.** Create one in FillScore under Settings, "API keys for AI clients (read-only)". The key is shown once. FillScore
  stores only its SHA-256. A key can only read (GET and HEAD), only the six routes of the tools above, and only its owner's account.
  It expires after 90 days unless you choose another time (1 to 365 days), you can revoke it at any time, you can have 5 active keys,
  and each key is limited to 60 requests a minute. A key never works for creating, listing or revoking keys, for exchange keys, or for
  any write. If you lose a key, revoke it and create another. Demo accounts need no key. `FILLSCORE_TOKEN` (a short-lived access
  token) still works as the older way.
- The URL must be `https` (plain `http` only for `localhost`), so the token is never sent in the clear.
- The server reads what the API returns; it does not hold data of its own and writes nothing.
- Numbers an AI client writes in its own words are the client's, not FillScore's; quote the tool output.
