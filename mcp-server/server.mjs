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

let tools;
try {
  tools = createTools({ apiUrl: process.env.FILLSCORE_API_URL ?? '', token: process.env.FILLSCORE_API_KEY || process.env.FILLSCORE_TOKEN, demoUser: process.env.FILLSCORE_DEMO_USER });
} catch (e) {
  console.error(`fillscore-mcp: ${e.message}`);
  process.exit(2);
}

const server = new McpServer({ name: 'fillscore', version: '0.1.0' });
for (const t of tools) {
  server.registerTool(t.name, { description: t.description, inputSchema: t.inputSchema }, async (args) => t.handler(args ?? {}));
}
await server.connect(new StdioServerTransport());
