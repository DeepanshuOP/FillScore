import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { assertLocalMongoUri } from '../lib/localMongo'
import { e2eBackendEnv } from './env'

/**
 * Seeds the demo users into the e2e MongoDB, then verifies all six exist.
 * Written permission (Phase 3a.2): the seed may run ONLY against a local MongoDB. assertLocalMongoUri()
 * throws for anything else (Atlas included) before any child process is started.
 */
const DEMO_USERS = ['demo-aggressive', 'demo-moderate', 'demo-disciplined', 'demo-bybit', 'demo-okx', 'demo-multi']

export default async function globalSetup() {
  const uri = assertLocalMongoUri(process.env.MONGODB_URI)
  const backend = resolve(__dirname, '../../backend')

  // `seed` inserts trades; `seed:audit` builds the audit documents the dashboard reads (Deepanshu extended the
  // written permission to it, local MongoDB only).
  for (const script of ['seed', 'seed:audit']) {
    const run = spawnSync('npm', ['run', script], {
      cwd: backend,
      // same block as the backend webServer (PORT etc. included), so CI needs no backend/.env
      env: { ...process.env, ...e2eBackendEnv(uri) } as NodeJS.ProcessEnv,
      encoding: 'utf8',
      timeout: 240_000,
    })
    if (run.status !== 0) {
      throw new Error(`e2e ${script} failed (exit ${run.status}):\n${(run.stdout ?? '').slice(-1500)}\n${(run.stderr ?? '').slice(-1500)}`)
    }
  }

  // mongoose lives in backend/node_modules; the frontend has no types for it
  type Conn = { collection(n: string): { distinct(f: string): Promise<unknown[]> }; close(): Promise<void> }
  const mongoose = createRequire(resolve(backend, 'package.json'))('mongoose') as {
    createConnection(u: string): { asPromise(): Promise<Conn> }
  }
  const conn = await mongoose.createConnection(uri).asPromise()
  try {
    const found = (await conn.collection('trades').distinct('userId')) as string[]
    const missing = DEMO_USERS.filter((u) => !found.includes(u))
    if (missing.length) throw new Error(`e2e seed incomplete, missing demo users: ${missing.join(', ')}`)
  } finally {
    await conn.close()
  }
}
