#!/usr/bin/env node
// The read-only FillScore MCP server (stdio). Configure with environment variables:
//   FILLSCORE_API_URL     base URL of the FillScore API (https; http only for localhost)
//   FILLSCORE_API_KEY     your personal read-only API key (Settings, "API keys for AI clients"; sent only as a bearer token to that URL)
//   FILLSCORE_TOKEN       or a short-lived access token (the older way; FILLSCORE_API_KEY wins when both are set)
//   FILLSCORE_DEMO_USER   or a demo-* account id, which needs no token
// It writes only protocol messages to stdout; everything else goes to stderr.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createTools } from './lib.mjs';
import { APP_MIME, APP_TOOL, SCORECARD_URI, buildScorecardHtml } from './app.mjs';

let tools;
try {
  tools = createTools({ apiUrl: process.env.FILLSCORE_API_URL ?? '', token: process.env.FILLSCORE_API_KEY || process.env.FILLSCORE_TOKEN, demoUser: process.env.FILLSCORE_DEMO_USER });
} catch (e) {
  console.error(`fillscore-mcp: ${e.message}`);
  process.exit(2);
}

const server = new McpServer({ name: 'fillscore', version: '0.1.0' });
for (const t of tools) {
  // MCP App (M7): the scorecard tool names its interactive view; a client without MCP Apps support ignores this and shows the text.
  const config = { description: t.description, inputSchema: t.inputSchema, ...(t.name === APP_TOOL ? { _meta: { ui: { resourceUri: SCORECARD_URI } } } : {}) };
  server.registerTool(t.name, config, async (args) => t.handler(args ?? {}));
}
// The view: a page with no network access (no csp is declared) that only renders the tool's own result.
server.registerResource('FillScore scorecard', SCORECARD_URI, { mimeType: APP_MIME, description: 'The measured score of the account, as an interactive card' },
  async () => ({ contents: [{ uri: SCORECARD_URI, mimeType: APP_MIME, text: buildScorecardHtml() }] }));
await server.connect(new StdioServerTransport());
