/**
 * CCXT shadow run (M6), local and read-only. It reads the same Binance account through the native connector and through CCXT, then prints
 * how far they agree (services/ccxtShadow.ts). It writes nothing to any database and sends nothing to FillScore.
 *
 *   read -rsp 'key: ' BINANCE_API_KEY; echo; read -rsp 'secret: ' BINANCE_API_SECRET; echo
 *   export BINANCE_API_KEY BINANCE_API_SECRET
 *   npx ts-node src/scripts/ccxtShadow.ts BTCUSDT
 *   unset BINANCE_API_KEY BINANCE_API_SECRET
 *
 * Never put a key on a command line (it lands in shell history and process lists) and never source an env file.
 * The two variables are read from the environment by name and are never printed. Use a READ-ONLY key (FillScore refuses any other).
 * Both sides read the most recent 1,000 trades of the symbol; trades older than the newer of the two oldest are left out of the comparison,
 * so the cut-off of the two lists is not reported as a difference. CCXT is a dev dependency (MIT, pinned): the production image does not
 * contain it. This run has not been made against a live account yet; see docs/PROGRESS.md.
 */
import * as ccxt from 'ccxt';
import { BinanceClient } from '../services/BinanceClient';
import { compareNativeAndCcxt, type CcxtTradeLike } from '../services/ccxtShadow';

async function main() {
    const symbol = (process.argv[2] ?? '').toUpperCase();
    if (!/^[A-Z0-9]{5,20}$/.test(symbol)) { console.error('usage: ts-node src/scripts/ccxtShadow.ts <SYMBOL, for example BTCUSDT>'); process.exit(2); }
    const key = process.env.BINANCE_API_KEY, secret = process.env.BINANCE_API_SECRET;
    if (!key || !secret) { console.error('BINANCE_API_KEY and BINANCE_API_SECRET must be set in the environment (names checked, values never printed)'); process.exit(2); }

    const native = await new BinanceClient(key, secret).fetchRecentTrades(symbol, 1000);
    const ex = new ccxt.binance({ apiKey: key, secret, enableRateLimit: true });
    const market = Object.values((await ex.loadMarkets()) as Record<string, { id: string; symbol: string }>).find(m => m.id === symbol);
    if (!market) { console.error(`CCXT has no market for ${symbol}`); process.exit(2); }
    const viaCcxt = (await ex.fetchMyTrades(market.symbol, undefined, 1000)) as unknown as CcxtTradeLike[];

    const oldest = (xs: number[]) => (xs.length ? Math.min(...xs) : 0);
    const from = Math.max(oldest(native.map(t => t.time)), oldest(viaCcxt.map(t => t.timestamp ?? 0)));
    const report = compareNativeAndCcxt(native.filter(t => t.time >= from), viaCcxt.filter(t => (t.timestamp ?? 0) >= from));
    console.log(JSON.stringify({ symbol, comparedFromMs: from, ...report, mismatches: report.mismatches.slice(0, 50) }, null, 2));
    console.log(report.agreement === null ? 'No trades on either side: nothing to compare.' : `Agreement ${(report.agreement * 100).toFixed(2)}% of ${report.matched + report.onlyNative.length + report.onlyCcxt.length} trades.`);
}

main().catch(e => { console.error('ccxtShadow failed:', (e as Error)?.name); process.exit(1); });
