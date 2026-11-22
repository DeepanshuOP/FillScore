import axios from 'axios';
import crypto from 'crypto';
import { BinanceRawTrade } from '../types';
import { BinanceBanError, BinanceGovernor, binanceGovernor } from './binanceGovernor';
import { ExchangeHttp, createExchangeHttp } from './exchangeEgress';

import { BinanceRawCommission, COMMISSION_WEIGHT, mapBinanceCommission } from './orders/binanceOrders';
import { FeeSnapshotDocument } from '../models/FeeSnapshot';

// IP request weights (https://developers.binance.com/docs/binance-spot-api-docs/rest-api/account-endpoints, read
// 2026-11-22): GET /api/v3/myTrades is 20 without an orderId; GET /api/v3/account/commission ("Query Commission
// Rates") is 20. The old fee call used /api/v3/tradeFee, which that page does not list (docs/research/LOG.md §AK).
const MY_TRADES_WEIGHT = 20;

export type CommissionRates = Pick<FeeSnapshotDocument, 'symbol' | 'standard' | 'tax' | 'special' | 'discount'>;

export class BinanceApiError extends Error {
    public statusCode: number | undefined;

    constructor(message: string, statusCode?: number) {
        super(message);
        this.name = 'BinanceApiError';
        this.statusCode = statusCode;
    }
}

export class BinanceClient {
    private axiosInstance: ExchangeHttp;
    private apiSecret: string;

    /** `governor` is the process-wide one in production: every Binance call shares one weight budget. */
    constructor(apiKey: string, apiSecret: string, private governor: BinanceGovernor = binanceGovernor) {
        this.apiSecret = apiSecret;
        // Host allow-list, https only, redirects off (exchangeEgress.ts)
        this.axiosInstance = createExchangeHttp('https://api.binance.com', {
            headers: {
                'X-MBX-APIKEY': apiKey,
            },
            // Short timeout to avoid hanging requests
            timeout: 10000,
        });
    }

    private signQuery(params: Record<string, string | number>): string {
        const queryString = Object.entries(params)
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
            .join('&');

        // HMAC-SHA256 signature
        const signature = crypto
            .createHmac('sha256', this.apiSecret)
            .update(queryString)
            .digest('hex');

        return `${queryString}&signature=${signature}`;
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private async executeWithRetry(getParams: () => Record<string, string | number>): Promise<BinanceRawTrade[]> {
        const makeRequest = async () => {
            // The signed query is built inside the governed call, after any wait for the weight budget: a timestamp taken
            // before a 60 s wait would be outside Binance's receive window (-1021).
            return this.governor.run(MY_TRADES_WEIGHT, () => {
                const params = {
                    ...getParams(),
                    timestamp: Date.now()
                };
                const signedQuery = this.signQuery(params);
                const url = `/api/v3/myTrades?${signedQuery}`;
                return this.axiosInstance.get<BinanceRawTrade[]>(url);
            });
        };

        try {
            const response = await makeRequest();
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 429) {
                    const retryAfterStr = error.response.headers['retry-after'];
                    // Fallback to 5 seconds if header isn't present
                    const retryAfterMs = retryAfterStr ? parseInt(retryAfterStr, 10) * 1000 : 5000;
                    // The governor recorded this 429 too and holds every other caller behind the same pause.
                    console.warn(`[BinanceClient] Rate limited HTTP 429. Retrying after ${retryAfterMs}ms...`);
                    await this.sleep(retryAfterMs);

                    try {
                        const retryResponse = await makeRequest();
                        return retryResponse.data;
                    } catch (retryError) {
                        if (axios.isAxiosError(retryError)) {
                            throw new BinanceApiError(`Retry failed: ${retryError.response?.data?.msg || retryError.message}`, retryError.response?.status);
                        }
                        throw new BinanceApiError('Retry failed due to unknown error');
                    }
                }

                throw new BinanceApiError(
                    `Binance API Error: ${error.response?.data?.msg || error.message}`,
                    error.response?.status
                );
            }
            if (error instanceof BinanceBanError) throw new BinanceApiError(error.message, 418);
            throw new BinanceApiError('Unknown error during Binance API request');
        }
    }

    public async fetchTradesForWindow(symbol: string, startTime: number, endTime: number): Promise<BinanceRawTrade[]> {
        return this.executeWithRetry(() => ({
            symbol,
            startTime,
            endTime,
            limit: 1000 // Binance max limit per page
        }));
    }

    public async fetchRecentTrades(symbol: string, limit = 1000): Promise<BinanceRawTrade[]> {
        return this.executeWithRetry(() => ({
            symbol,
            limit
        }));
    }

    /** The account's commission rates for one symbol (raw parts; the effective-rate formula is ml-service/measure/fees.py).
     *  Same documented endpoint and parser as the sync's snapshot (services/orders/binanceOrders.ts). */
    public async fetchCommission(symbol: string): Promise<CommissionRates> {
        let raw: BinanceRawCommission;
        try {
            const response = await this.governor.run(COMMISSION_WEIGHT, () => {
                // signed after any wait for the weight budget (see executeWithRetry)
                const signedQuery = this.signQuery({ symbol, timestamp: Date.now() });
                return this.axiosInstance.get<BinanceRawCommission>(`/api/v3/account/commission?${signedQuery}`);
            });
            raw = response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new BinanceApiError(
                    `Binance API Error (fetchCommission): ${error.response?.data?.msg || error.message}`,
                    error.response?.status
                );
            }
            if (error instanceof BinanceBanError) throw new BinanceApiError(error.message, 418);
            throw new BinanceApiError('Unknown error during fetchCommission');
        }
        try {
            const { symbol: s, standard, tax, special, discount } = mapBinanceCommission(raw, '', 0);
            return { symbol: s, standard, tax, special, ...(discount ? { discount } : {}) };
        } catch {
            throw new BinanceApiError('Binance commission response had an unexpected shape');
        }
    }
}
