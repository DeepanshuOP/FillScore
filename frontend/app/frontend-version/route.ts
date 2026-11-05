import { NextResponse } from 'next/server';
import { frontendCommit } from '../lib/buildInfo';

// Not under /api: next.config.mjs proxies /api/* to the backend on Vercel.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ commit: frontendCommit() });
}
