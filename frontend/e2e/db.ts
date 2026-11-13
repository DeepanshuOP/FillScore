import { createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { assertLocalMongoUri } from '../lib/localMongo'

/**
 * e2e-only access to the LOCAL test MongoDB. Every entry point calls assertLocalMongoUri() first, so a
 * non-local URI (Atlas included) throws before any connection is opened.
 *
 * The backend stores only sha256(rawToken) of an email-verification token; the raw token exists only in the
 * email. With no mail provider in e2e there is no inbox to read, so we do what the mailer does: mint a raw
 * token, store its hash for the new user, and return the link the email would contain.
 */
type Coll = {
  findOne(q: object): Promise<{ _id: unknown; emailVerified?: boolean } | null>
  insertOne(d: object): Promise<unknown>
  insertMany(d: object[]): Promise<unknown>
  deleteMany(q: object): Promise<unknown>
}
type Conn = { collection(n: string): Coll; close(): Promise<void> }

async function withDb<T>(uri: string | undefined, fn: (c: Conn) => Promise<T>): Promise<T> {
  const safe = assertLocalMongoUri(uri) // throws for anything non-local, before connecting
  const backend = resolve(__dirname, '../../backend')
  const mongoose = createRequire(resolve(backend, 'package.json'))('mongoose') as {
    createConnection(u: string): { asPromise(): Promise<Conn> }
  }
  const conn = await mongoose.createConnection(safe).asPromise()
  try {
    return await fn(conn)
  } finally {
    await conn.close()
  }
}

/** Returns the in-app path of the verification link for a registered user (what the email button points at). */
export async function issueVerificationPath(email: string, uri = process.env.MONGODB_URI): Promise<string> {
  return withDb(uri, async (db) => {
    const user = await db.collection('users').findOne({ email: email.toLowerCase() })
    if (!user) throw new Error('e2e: no such user in the local database')
    const raw = randomBytes(32).toString('hex')
    await db.collection('emailverificationtokens').insertOne({
      userId: user._id,
      tokenHash: createHash('sha256').update(raw).digest('hex'),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
    })
    return `/verify-email?token=${raw}`
  })
}

/**
 * Reshapes ONE demo account in the LOCAL e2e database into what the M2 seed produces (decision 11): trades with no
 * per-trade v1 fields, orders and order measurements. The frozen v1 audit is left as seeded. Local database only:
 * withDb refuses any other URI. The hand values match backend/src/routes/__tests__/rebuiltDemo.test.ts.
 */
export async function reshapeDemoAsRebuilt(accountId: string, uri = process.env.MONGODB_URI): Promise<void> {
  if (!/^demo-(aggressive|moderate|disciplined)$/.test(accountId)) throw new Error('e2e: not a rebuilt demo id')
  await withDb(uri, async (db) => {
    for (const c of ['trades', 'orders', 'order_measurements']) await db.collection(c).deleteMany({ accountId })
    const t = (id: string) => ({
      accountId, userId: accountId, exchange: 'binance', symbol: 'BTCUSDT', side: 'BUY', orderType: 'MARKET', isMaker: false,
      dataSource: 'synthetic-demo', quantity: 0.01, executionPrice: 42000, notional: 420, fee: 0.42, feeAsset: 'USDT', feeUsd: 0.42,
      tradeId: id, orderId: `o-${id}`, executedAt: new Date('2024-01-15T14:00:00.500Z'),
    })
    await db.collection('trades').insertMany([t('r1'), t('r2'), t('r3')])
    const o = (id: string, type: string, origQty: number, executedQty: number, status: string, restingMs: number | null) => ({
      accountId, exchange: 'binance', symbol: 'BTCUSDT', orderId: id, side: 'BUY', type, origQty, executedQty, status, restingMs,
      createdAt: new Date('2024-01-15T14:00:00Z'), updatedAt: new Date('2024-01-15T14:00:05Z'), dataSource: 'synthetic-demo',
    })
    await db.collection('orders').insertMany([o('1', 'LIMIT', 1, 1, 'FILLED', 1000), o('2', 'LIMIT', 2, 2, 'FILLED', 3000),
      o('3', 'MARKET', 1, 1, 'FILLED', null), o('4', 'LIMIT', 1, 0, 'CANCELED', null), o('5', 'LIMIT', 1, 0.5, 'CANCELED', 5000)])
    const m = (id: string, shortfall: object | null, reason: string | null = null) => ({
      accountId, exchange: 'binance', symbol: 'BTCUSDT', orderId: id, version: '1.0.0', side: 1, arrivalMs: 1, shortfall,
      unmeasuredReason: reason, measuredAt: new Date('2024-03-01'),
    })
    await db.collection('order_measurements').insertMany([
      m('1', { executionBps: 2, spreadBps: 1, impactTimingBps: 1, opportunityBps: 0, totalBps: 2.5 }),
      m('2', { executionBps: 4, spreadBps: 1, impactTimingBps: 3, opportunityBps: 0, totalBps: 4.5 }),
      m('4', { executionBps: 0, spreadBps: null, impactTimingBps: null, opportunityBps: 7, totalBps: 7 }),
      m('5', null, 'no_quote_at_arrival')])
  })
}

export async function isEmailVerified(email: string, uri = process.env.MONGODB_URI): Promise<boolean> {
  return withDb(uri, async (db) => {
    const user = await db.collection('users').findOne({ email: email.toLowerCase() })
    return user?.emailVerified === true
  })
}
