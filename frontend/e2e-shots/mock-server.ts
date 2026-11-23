/**
 * The QA fixtures (mock.ts) as a plain HTTP server, for tools that open their own browser page and so cannot use Playwright's
 * page.route (Lighthouse). Build the frontend with BACKEND_PROXY_URL=http://127.0.0.1:3199 so its /api rewrite reaches this
 * server, then:  npx tsx e2e-shots/mock-server.ts [port=3199] [signedIn=0]
 * Every answer comes from the offline demo fixtures; no database, no network.
 */
import http from 'node:http'
import { mock } from './mock'

type Fulfil = { status?: number; contentType?: string; body?: string }
type Handler = (route: { request: () => { url: () => string }; fulfill: (r: Fulfil) => Promise<void> }) => Promise<void>

async function main() {
  const port = Number(process.argv[2] ?? 3199)
  const signedIn = process.argv[3] === '1'
  const handlers: Array<[string, Handler]> = []
  const fakePage = { route: async (pattern: string, h: Handler) => { handlers.push([pattern, h]) } }
  await mock(fakePage as never, signedIn)
  const api = handlers.find(([p]) => p === '**/api/**')?.[1]
  if (!api) throw new Error('mock.ts registered no /api handler')
  http.createServer((req, res) => {
    const url = `http://127.0.0.1:${port}${req.url ?? '/'}`
    const fulfill = async (r: Fulfil) => { res.writeHead(r.status ?? 200, { 'content-type': r.contentType ?? 'application/json' }); res.end(r.body ?? '') }
    if ((req.url ?? '').startsWith('/api/')) void api({ request: () => ({ url: () => url }), fulfill })
    else if (req.url === '/health') void fulfill({ body: '{"status":"ok"}' })
    else void fulfill({ status: 404, body: '{"error":"not mocked"}' })
  }).listen(port, '127.0.0.1', () => console.log(`mock api on ${port}`))
}

void main()
