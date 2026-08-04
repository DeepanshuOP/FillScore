import { NextResponse } from 'next/server';

// THROWAWAY diagnostic (R5-C7 adjacent) — answers "does Binance 451 from an
// EU datacenter?" via the existing Vercel deployment. Delete once the real
// host is chosen. No shared code with the backend on purpose.

export const runtime = 'nodejs';
export const preferredRegion = 'fra1';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 5000;

const ENDPOINTS = [
  { exchange: 'binance', url: 'https://api.binance.com/api/v3/time' },
  { exchange: 'bybit', url: 'https://api.bybit.com/v5/market/time' },
  { exchange: 'okx', url: 'https://www.okx.com/api/v5/public/time' },
] as const;

interface ExchangeCheck {
  exchange: string;
  httpStatus: number | null;
  ok: boolean;
  latencyMs: number;
}

async function probe(exchange: string, url: string): Promise<ExchangeCheck> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    return { exchange, httpStatus: res.status, ok: res.ok, latencyMs: Date.now() - start };
  } catch {
    return { exchange, httpStatus: null, ok: false, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const exchanges = await Promise.all(
    ENDPOINTS.map(({ exchange, url }) => probe(exchange, url))
  );

  return NextResponse.json({
    region: process.env.VERCEL_REGION ?? 'unknown',
    checkedAt: new Date().toISOString(),
    exchanges,
  });
}
