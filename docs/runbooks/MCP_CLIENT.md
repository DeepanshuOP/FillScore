# Connect the read-only FillScore MCP server to Claude Code

For Deepanshu. Written 2026-11-22 from `mcp-server/server.mjs`, `mcp-server/lib.mjs` and `mcp-server/README.md`. I did not run
`claude mcp add` and I did not edit any settings file; the commands below are yours to run.

The server reads only. Every tool makes one `GET` to the FillScore API; it computes, predicts and advises nothing.

## What it needs

| Item | Value (from the code) |
|---|---|
| Entrypoint | `mcp-server/server.mjs`, started with `node` (Node 26 or later: `engines` in `mcp-server/package.json`) |
| Transport | stdio |
| Environment names | `FILLSCORE_API_URL` (required; `https`, or `http` for `localhost` only), and one of `FILLSCORE_API_KEY` (a personal read-only key), `FILLSCORE_TOKEN` (an older, short-lived access token) or `FILLSCORE_DEMO_USER` (a `demo-*` id; no token) |
| Live API host | `https://fillscore-api.onrender.com` (the host `scripts/smoke_prod.sh` names). The free Render service sleeps: the first call can take about a minute. |

## 1. Install once

```bash
cd ~/FillScore/mcp-server && npm ci
```

## 2. Add it to Claude Code on a demo account (no key)

```bash
claude mcp add --transport stdio fillscore \
  --env FILLSCORE_API_URL=https://fillscore-api.onrender.com \
  --env FILLSCORE_DEMO_USER=demo-moderate \
  -- node /home/shree/FillScore/mcp-server/server.mjs
```

Check it: `claude mcp list` should show `fillscore`. Inside Claude Code, `/mcp` shows the six tools.

To remove it later: `claude mcp remove fillscore`.

## 3. The demo-account call to try

Ask Claude Code: "Call `fillscore_score` and `fillscore_orders_summary` for the demo account and quote the tool output."
What to expect for `demo-moderate` (values from `docs/STATUS.md` and the committed demo grades; the tool output is the authority):

- `fillscore_score`: the measured score under scoring v2.3.0, composite 93.40556873724222 (A), with the version and integrity hash.
  The demo is a synthetic trader on real January 2024 prices, and the tool says so.
- `fillscore_orders_summary`: how the 245 orders ended and the shortfall totals per term, in USD and basis points.

The other four tools: `fillscore_exceptions`, `fillscore_order_replay` (needs an `orderId`), `fillscore_rankings` (`by` is `symbol` or
`hour`), `fillscore_venue_comparison`. Numbers Claude writes in its own words are Claude's, not FillScore's: quote the tool output.

## 4. Your own account (after you have scored real trades)

Create a key in FillScore under Settings, "API keys for AI clients (read-only)". It is shown once. Then:

```bash
claude mcp add --transport stdio fillscore-me \
  --env FILLSCORE_API_URL=https://fillscore-api.onrender.com \
  --env FILLSCORE_API_KEY=<the key, pasted by you> \
  -- node /home/shree/FillScore/mcp-server/server.mjs
```

The key can only read (`GET` and `HEAD`), only the six routes of the tools, and only its owner's account. It expires after 90 days unless
you choose another time, is limited to 60 requests a minute, and can be revoked in Settings.
Do not paste a key into a file in the repository. `claude mcp add` stores it in Claude Code's own configuration.

## 5. The scorecard as an MCP App

`fillscore_score` also offers an interactive scorecard (`ui://fillscore/scorecard.html`, MIME type `text/html;profile=mcp-app`).
It shows only in a **host that renders MCP Apps**. A client without that extension shows the tool's text instead; Claude Code in a
terminal is such a client, so the card will not draw there. The card makes no network request and renders text only.
Honest status (from `mcp-server/README.md`): it has not been tried in a real MCP Apps host. The protocol and the page are tested
against the specification's message shapes with a fake host (`cd mcp-server && npm test`).
