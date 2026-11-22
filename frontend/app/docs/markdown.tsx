import { Fragment, type ReactNode } from 'react'

/**
 * A small, safe Markdown renderer for the docs pages (IA v4). It reads the subset the two documents use: headings, paragraphs,
 * fenced code, tables, bullet and numbered lists, `code`, **bold** and [links](https://...). Text is always escaped by React, so
 * raw HTML in a document is shown as text; only http(s) links and addresses on this site become links (a path into the repository,
 * such as ../../README.md, stays plain text, and a `javascript:` address never links). No dependency.
 */

const isSafeHref = (u: string) => /^https?:\/\//i.test(u) || (u.startsWith('/') && !u.startsWith('//'))

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  // one pass over `code`, **bold** and [text](url)
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const key = `${keyBase}-${i++}`
    if (m[1] !== undefined) out.push(<code key={key} className="rounded-[3px] bg-ui-overlay px-1 py-px font-mono text-[0.9em] [overflow-wrap:anywhere]">{m[1]}</code>)
    else if (m[2] !== undefined) out.push(<strong key={key}>{m[2]}</strong>)
    else if (isSafeHref(m[4])) out.push(<a key={key} href={m[4]} {...(m[4].startsWith('/') ? {} : { rel: 'noopener noreferrer' })} className="text-ui-ink underline underline-offset-2">{m[3]}</a>)
    else out.push(<Fragment key={key}>{m[3]}</Fragment>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
const isTableSep = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line)

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0, k = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    const key = `b${k++}`

    const fence = line.match(/^```(\w*)\s*$/)
    if (fence) {
      const code: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++])
      i++ // the closing fence
      // tabIndex 0: a scrollable block must be reachable by keyboard (axe: scrollable-region-focusable)
      blocks.push(<pre key={key} tabIndex={0} className="my-4 overflow-x-auto rounded-[4px] bg-ui-raised p-4 font-mono text-[13px] leading-5 text-ui-ink"><code>{code.join('\n')}</code></pre>)
      continue
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      const cls = level === 1 ? 'display-md text-ui-ink' : level === 2 ? 'mt-12 text-[1.5rem] leading-tight font-black tracking-[-0.02em] text-ui-ink' : 'mt-8 text-[1.125rem] font-bold text-ui-ink'
      const Tag = (`h${level}`) as 'h1' | 'h2' | 'h3'
      blocks.push(<Tag key={key} className={cls}>{inline(h[2], key)}</Tag>)
      i++
      continue
    }

    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]))
      blocks.push(
        <div key={key} tabIndex={0} className="my-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead><tr>{head.map((c, j) => <th key={j} className="border-b border-ui-ink px-3 py-2 font-mono text-[12px] font-normal tracking-[0.04em] text-ui-graphite uppercase">{inline(c, `${key}h${j}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} className="border-b border-dashed border-ui-rule px-3 py-2 align-top text-ui-ink [overflow-wrap:break-word]">{inline(c, `${key}r${ri}c${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      )
      continue
    }

    const bullet = /^\s*[-*]\s+/, numbered = /^\s*\d+\.\s+/
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line)
      const re = ordered ? numbered : bullet
      const items: string[] = []
      while (i < lines.length && re.test(lines[i])) {
        let t = lines[i++].replace(re, '')
        while (i < lines.length && lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !bullet.test(lines[i]) && !numbered.test(lines[i])) t += ` ${lines[i++].trim()}`
        items.push(t)
      }
      const List = ordered ? 'ol' : 'ul'
      blocks.push(<List key={key} className={`my-3 flex max-w-[68ch] flex-col gap-1.5 pl-5 text-[16px] leading-snug text-ui-ink ${ordered ? 'list-decimal' : 'list-disc'}`}>{items.map((t, j) => <li key={j}>{inline(t, `${key}i${j}`)}</li>)}</List>)
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^```/.test(lines[i]) && !/^#{1,3}\s/.test(lines[i]) && !(lines[i].trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) && !bullet.test(lines[i]) && !numbered.test(lines[i])) para.push(lines[i++].trim())
    blocks.push(<p key={key} className="my-3 max-w-[68ch] text-[16px] leading-relaxed text-ui-ink">{inline(para.join(' '), key)}</p>)
  }
  return <>{blocks}</>
}
