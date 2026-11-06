/** Local-only guard for anything that seeds MongoDB (e2e global-setup). Never seed Atlas. */
const LOCAL = /^mongodb:\/\/(?:[^@/]*@)?(?:127\.0\.0\.1|localhost)(?::\d+)?(?:[/?]|$)/

export function isLocalMongoUri(uri: string | undefined): boolean {
  return typeof uri === 'string' && LOCAL.test(uri)
}

/** Returns the uri if it is local, else throws. The uri is never included in the message (it may hold a password). */
export function assertLocalMongoUri(uri: string | undefined): string {
  if (!isLocalMongoUri(uri)) {
    throw new Error('Refusing to seed: MONGODB_URI is not a local MongoDB (mongodb://127.0.0.1… or mongodb://localhost…).')
  }
  return uri as string
}
