import { ExchangeConnection } from '../models/ExchangeConnection';
import { TradeIngestionService } from './TradeIngestionService';
import { decryptApiKey } from '../utils/encryption';
import { INGEST_SYMBOLS } from '../config/ingestion';
import { BinanceHistorySync } from './BinanceHistorySync';
import { validateBinanceKey, validateBybitKey, validateOKXKey } from './keyValidation';

/** Bybit/OKX still use the fixed symbol list and 24h windows; cap their window so a sync stays bounded. */
export const NON_BINANCE_MAX_DAYS = 30;

export interface SyncFailure {
    exchange: string;
    symbol: string;
    reason: string;
}

export interface SyncReport {
    inserted: number;
    skipped: number;
    failures: SyncFailure[];
    partial?: boolean;
    partialMessage?: string;
    invalidSymbols?: string[];
    symbolsScanned?: number;
    /** Connections refused because the key is no longer read-only (or could not be verified). */
    refused?: Array<{ exchange: string; reason: 'key_not_read_only' | 'invalid_key' | 'network_error' }>;
    lookbackDays?: number;
    effectiveDays?: Record<string, number>;
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

        // Re-check the key on every sync. A key that gained trade/withdraw rights, or whose permissions
        // cannot be read, is not used (fail closed).
        try {
            if (conn.exchange === 'binance') await validateBinanceKey(apiKey, apiSecret);
            else if (conn.exchange === 'bybit') await validateBybitKey(apiKey, apiSecret);
            else await validateOKXKey(apiKey, apiSecret, passphrase);
        } catch (e: any) {
            const reason = (['key_not_read_only', 'invalid_key'].includes(e?.message) ? e.message : 'network_error') as 'key_not_read_only' | 'invalid_key' | 'network_error';
            report.refused = [...(report.refused ?? []), { exchange: conn.exchange, reason }];
            report.failures.push({ exchange: conn.exchange, symbol: '*', reason });
            if (reason !== 'network_error') {
                await ExchangeConnection.updateOne({ _id: conn._id }, { $set: { status: 'needs_attention', statusReason: reason } });
            }
            continue;
        }

        const days = conn.lookbackDays ?? daysBack;
        report.lookbackDays = Math.max(report.lookbackDays ?? 0, days);
        report.effectiveDays = { ...(report.effectiveDays ?? {}), [conn.exchange]: conn.exchange === 'binance' ? days : Math.min(days, NON_BINANCE_MAX_DAYS) };

        if (conn.exchange === 'binance') {
            try {
                const r = await new BinanceHistorySync(apiKey, apiSecret, accountId, { lookbackDays: days, extraSymbols: conn.extraSymbols ?? [] }).run();
                report.inserted += r.inserted;
                report.skipped += r.skipped;
                report.symbolsScanned = (report.symbolsScanned ?? 0) + r.symbolsScanned;
                report.invalidSymbols = [...(report.invalidSymbols ?? []), ...r.invalidSymbols];
                if (r.partial) { report.partial = true; report.partialMessage = r.message; }
                await ExchangeConnection.updateOne({ _id: conn._id }, { $set: { status: 'ok', lastSyncAt: new Date(), lastSyncPartial: r.partial }, $unset: { statusReason: '' } });
            } catch (e: any) {
                console.error(`[Sync] binance history failed: ${e?.message}`);
                report.failures.push({ exchange: 'binance', symbol: '*', reason: e?.message ?? 'binance_sync_failed' });
            }
            continue;
        }
        const bounded = Math.min(days, NON_BINANCE_MAX_DAYS);

        const results = await Promise.allSettled(
            INGEST_SYMBOLS.map(symbol => {
                switch (conn.exchange) {
                    case 'bybit':
                        return ingestion.ingestBybitForUser(accountId, apiKey, apiSecret, symbol, bounded);
                    case 'okx':
                        return ingestion.ingestOKXForUser(accountId, apiKey, apiSecret, passphrase, toOkxInstId(symbol), bounded);
                    default:
                        return ingestion.ingestForUser(accountId, apiKey, apiSecret, symbol, bounded);
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
