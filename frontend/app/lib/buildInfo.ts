/** Commit the frontend was built from. Vercel sets VERCEL_GIT_COMMIT_SHA at build and run time. */
export function frontendCommit(env: Record<string, string | undefined> = process.env): string {
  return env.VERCEL_GIT_COMMIT_SHA || 'unknown';
}
