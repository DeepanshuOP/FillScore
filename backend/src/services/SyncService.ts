import { ExchangeConnection } from '../models/ExchangeConnection';
import { TradeIngestionService } from './TradeIngestionService';
import { decryptApiKey } from '../utils/encryption';
import { INGEST_SYMBOLS } from '../config/ingestion';

export interface SyncFailure {
    exchange: string;
    symbol: string;
    reason: string;
}

export interface SyncReport {
    inserted: number;
    skipped: number;
    failures: SyncFailure[];
}

// BTCUSDT -> BTC-USDT, the instrument id format OKX expects
const toOkxInstId = (symbol: string) => symbol.replace(/USDT$/, '-USDT');

/**
 * Pulls trades for every exchange the account has connected. Per-symbol failures are
 * collected rather than thrown so one rate-limited symbol cannot sink the whole sync.
 */
export async function syncAccountTrades(accountId: string, daysBack: number): Promise<SyncReport> {
    const connections = await ExchangeConnection.find({ accountId });
    if (connections.length === 0) {
        throw new Error('no_exchange_connections');
    }

    const ingestion = new TradeIngestionService();
    const report: SyncReport = { inserted: 0, skipped: 0, failures: [] };

    for (const conn of connections) {
        const apiKey = decryptApiKey(conn.encryptedApiKey);
        const apiSecret = decryptApiKey(conn.encryptedApiSecret);

        let passphrase = '';
        if (conn.exchange === 'okx') {
            if (!conn.encryptedPassphrase) {
                report.failures.push({ exchange: 'okx', symbol: '*', reason: 'missing_passphrase' });
                continue;
            }
            passphrase = decryptApiKey(conn.encryptedPassphrase);
        }

        const results = await Promise.allSettled(
            INGEST_SYMBOLS.map(symbol => {
                switch (conn.exchange) {
                    case 'bybit':
                        return ingestion.ingestBybitForUser(accountId, apiKey, apiSecret, symbol, daysBack);
                    case 'okx':
                        return ingestion.ingestOKXForUser(accountId, apiKey, apiSecret, passphrase, toOkxInstId(symbol), daysBack);
                    default:
                        return ingestion.ingestForUser(accountId, apiKey, apiSecret, symbol, daysBack);
                }
            })
        );

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                report.inserted += result.value.inserted;
                report.skipped += result.value.skipped;
            } else {
                const reason = result.reason?.message ?? String(result.reason);
                console.error(`[Sync] ${conn.exchange} ${INGEST_SYMBOLS[index]} failed: ${reason}`);
                report.failures.push({ exchange: conn.exchange, symbol: INGEST_SYMBOLS[index], reason });
            }
        });
    }

    return report;
}
