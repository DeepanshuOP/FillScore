import { describe, it, expect, vi, afterEach } from 'vitest'
import { issueVerificationPath, isEmailVerified } from '../e2e/db'

// The e2e helper must refuse every non-local URI before it opens a connection (a connection attempt to these
// hosts would hang or fail with a different message; the guard message proves it never got that far).
const NON_LOCAL = [
  'mongodb+srv://cluster0.abc.mongodb.net/fillscore',
  'mongodb://cluster0-shard-00-00.abc.mongodb.net:27017/x',
  'mongodb://127.0.0.1.evil.com/x',
  undefined,
]

describe('e2e db helper is local-only', () => {
  afterEach(() => vi.unstubAllEnvs())

  for (const uri of NON_LOCAL) {
    it(`issueVerificationPath refuses ${uri ?? 'undefined'}`, async () => {
      // `undefined` would fall back to the shell's MONGODB_URI (a default parameter), so pin that to empty
      vi.stubEnv('MONGODB_URI', '')
      await expect(issueVerificationPath('a@b.co', uri)).rejects.toThrow(/Refusing to seed/)
    })
    it(`isEmailVerified refuses ${uri ?? 'undefined'}`, async () => {
      vi.stubEnv('MONGODB_URI', '')
      await expect(isEmailVerified('a@b.co', uri)).rejects.toThrow(/Refusing to seed/)
    })
  }
})
