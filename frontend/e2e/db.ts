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

export async function isEmailVerified(email: string, uri = process.env.MONGODB_URI): Promise<boolean> {
  return withDb(uri, async (db) => {
    const user = await db.collection('users').findOne({ email: email.toLowerCase() })
    return user?.emailVerified === true
  })
}
