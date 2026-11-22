import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from './markdown'

const html = (src: string) => renderToStaticMarkup(<Markdown source={src} />)

describe('Markdown (the docs pages)', () => {
  it('headings and paragraphs: lines of one paragraph join with a space; text is escaped, never raw HTML', () => {
    const out = html('# Title\n\nFirst line\nsecond line.\n\n## Part <b>2</b>\n')
    expect(out).toContain('<h1')
    expect(out).toContain('>Title</h1>')
    expect(out).toContain('First line second line.</p>')
    expect(out).toContain('Part &lt;b&gt;2&lt;/b&gt;</h2>')
    expect(out).not.toContain('<b>')
  })

  it('inline code, bold and links: http links open as links; a relative repository path stays text; javascript: never links', () => {
    const out = html('Use `fm.order_is` and **both** [the site](https://example.org/x), [the repo file](../../README.md), [bad](javascript:alert(1)).')
    expect(out).toContain('<code')
    expect(out).toContain('>fm.order_is</code>')
    expect(out).toContain('<strong>both</strong>')
    expect(out).toContain('href="https://example.org/x"')
    expect(out).toContain('rel="noopener noreferrer"')
    expect(out).toContain('the repo file')
    expect(out).not.toContain('README.md"')
    expect(out).not.toContain('javascript:')
  })

  it('fenced code keeps its lines and is not parsed as Markdown', () => {
    const out = html('```bash\ncd x && npm ci   # **not bold**\n  indented\n```\n')
    expect(out).toContain('<pre')
    expect(out).toContain('cd x &amp;&amp; npm ci   # **not bold**\n  indented')
    expect(out).not.toContain('<strong>')
  })

  it('a table: header cells, the separator row dropped, body rows, inline code inside a cell', () => {
    const out = html('| Item | Value |\n|---|---|\n| Transport | stdio |\n| Name | `FILLSCORE_API_URL` |\n')
    expect(out).toContain('<table')
    expect(out).toContain('<th')
    expect(out.match(/<th[ >]/g)?.length).toBe(2)       // two header cells (not counting <thead>)
    expect(out.match(/<tr/g)?.length).toBe(3)            // one header row and two body rows
    expect(out).toContain('>FILLSCORE_API_URL</code>')
    expect(out).not.toContain('---')
  })

  it('bullet and numbered lists', () => {
    const out = html('- one\n- two with `code`\n\n1. first\n2. second\n')
    expect(out.match(/<li/g)?.length).toBe(4)
    expect(out).toContain('<ul')
    expect(out).toContain('<ol')
  })
})

describe('the docs copies cannot drift from their sources', () => {
  // The site is built from `frontend/` alone, so the two documents are copied into app/docs/content/ (cp, nothing edited).
  const root = join(process.cwd(), '..')
  it.each([
    ['docs/runbooks/MCP_CLIENT.md', 'app/docs/content/mcp.md'],
    ['packages/fillscore-metrics/README.md', 'app/docs/content/package.md'],
  ])('%s is the same text as %s', (source, copy) => {
    expect(readFileSync(join(process.cwd(), copy), 'utf8')).toBe(readFileSync(join(root, source), 'utf8'))
  })
  it('the public MCP page carries no personal address and no local path', () => {
    const t = readFileSync(join(process.cwd(), 'app/docs/content/mcp.md'), 'utf8')
    expect(t).not.toMatch(/\/home\/|Deepanshu|~\/FillScore/)
  })
})
