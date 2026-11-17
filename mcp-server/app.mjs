// The MCP App of the FillScore MCP server (M7): the page an AI client shows inside the conversation for the tool `fillscore_score`.
// Facts from the MCP Apps specification 2026-01-26 (https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx,
// read 2026-11-18): the resource URI uses the `ui://` scheme, the MIME type is `text/html;profile=mcp-app`, and a tool points to it with
// `_meta.ui.resourceUri`. No `csp` is declared, so the host keeps its closed default: the page can make no network request.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCORECARD_URI = 'ui://fillscore/scorecard.html';
export const APP_MIME = 'text/html;profile=mcp-app';
export const PROTOCOL_VERSION = '2026-01-26';
export const APP_TOOL = 'fillscore_score';

/** The page: the template with the pure view model inlined (its `export` keywords removed) and the protocol version written in. */
export function buildScorecardHtml() {
  const view = fs.readFileSync(path.join(HERE, 'ui', 'scorecardView.mjs'), 'utf8').replace(/^export /gm, '');
  return fs.readFileSync(path.join(HERE, 'ui', 'scorecard.template.html'), 'utf8')
    .replace('/*__VIEW__*/', () => view)
    .replace('/*__PROTOCOL__*/', PROTOCOL_VERSION);
}
