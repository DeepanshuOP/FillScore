import { describe, it, expect } from 'vitest'
import { isLocalMongoUri, assertLocalMongoUri } from './localMongo'

// Hand-computed table: only a single-host mongodb:// URI whose host is exactly 127.0.0.1 or localhost passes.
describe('isLocalMongoUri', () => {
  const yes = [
    'mongodb://127.0.0.1:27018/fillscore_e2e',
    'mongodb://127.0.0.1/x',
    'mongodb://localhost/x',
    'mongodb://localhost:27017',
    'mongodb://u:p@127.0.0.1:27017/x?authSource=admin',
  ]
  const no = [
    'mongodb+srv://cluster0.abc.mongodb.net/fillscore', // Atlas
    'mongodb://cluster0-shard-00-00.abc.mongodb.net:27017/x',
    'mongodb://127.0.0.1.evil.com/x', // host merely starts with 127.0.0.1
    'mongodb://localhost.evil.com/x',
    'mongodb://127.0.0.1,atlas.mongodb.net/x', // multi-host
    'mongodb://u:127.0.0.1@evil.com/x', // local-looking userinfo
    'mongodb://evil.com/?h=127.0.0.1',
    'mongodb://10.0.0.5/x',
    '',
  ]
  for (const u of yes) it(`accepts ${u}`, () => expect(isLocalMongoUri(u)).toBe(true))
  for (const u of no) it(`rejects ${u || '(empty)'}`, () => expect(isLocalMongoUri(u)).toBe(false))
  it('rejects undefined', () => expect(isLocalMongoUri(undefined)).toBe(false))
})

describe('assertLocalMongoUri', () => {
  it('returns a local uri', () => expect(assertLocalMongoUri('mongodb://localhost/x')).toBe('mongodb://localhost/x'))
  it('throws on Atlas and never echoes the uri', () => {
    const atlas = 'mongodb+srv://user:secretpw@cluster0.abc.mongodb.net/x'
    expect(() => assertLocalMongoUri(atlas)).toThrow(/refusing to seed/i)
    try { assertLocalMongoUri(atlas) } catch (e) { expect(String(e)).not.toContain('secretpw') }
  })
})
