import type { Metadata } from 'next'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Markdown } from '../markdown'

export const metadata: Metadata = { title: 'MCP client — FillScore Docs' }

/** From docs/runbooks/MCP_CLIENT.md (copied to app/docs/content/mcp.md; a test fails if the two differ). */
export default function McpDoc() {
  return <Markdown source={readFileSync(join(process.cwd(), 'app/docs/content/mcp.md'), 'utf8')} />
}
