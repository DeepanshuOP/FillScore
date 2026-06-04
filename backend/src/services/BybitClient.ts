import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { BybitRawTrade, NormalisedTrade } from '../types';

export class BybitApiError extends Error {
    public retCode: number;

    constructor(retCode: number, message: string) {
        super(`Bybit API Error ${retCode}: ${message}`);
        this.name = 'BybitApiError';
        this.retCode = retCode;
    }
}

export class BybitClient {
    private apiKey: string;
    private apiSecret: string;
    private axiosInstance: AxiosInstance;

    constructor(apiKey: string, apiSecret: string) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.axiosInstance = axios.create({
            baseURL: 'https://api.bybit.com',
            timeout: 10000,
        });
    }

    private signQuery(params: Record<string, string | number>, timestamp: string, recvWindow: string): string {
        const queryString = Object.keys(params)
            .sort()
            .map(k => `${k}=${params[k]}`)
            .join('&');

        // Bybit v5 signing: timestamp + apiKey + recvWindow + queryString
        const payload = timestamp + this.apiKey + recvWindow + queryString;

        return crypto
            .createHmac('sha256', this.apiSecret)
            .update(payload)
            .digest('hex');
    }

    public async fetchTradesForWindow(symbol: string, startTime: number, endTime: number): Promise<BybitRawTrade[]> {
        const allTrades: BybitRawTrade[] = [];
        let cursor: string | undefined = undefined;
        const recvWindow = '5000';

        while (true) {
            const timestamp = Date.now().toString();
            const params: Record<string, string | number> = {
                category: 'linear',
                symbol,
                startTime,
                endTime,
                limit: 50
            };

            if (cursor) {
                params.cursor = cursor;
            }

            const signature = this.signQuery(params, timestamp, recvWindow);

            const queryString = Object.keys(params)
                .sort()
                .map(k => `${k}=${params[k]}`)
                .join('&');

            const url = `/v5/execution/list?${queryString}`;

            try {
                const response = await this.axiosInstance.get(url, {
                    headers: {
                        'X-BAPI-API-KEY': this.apiKey,
                        'X-BAPI-SIGN': signature,
                        'X-BAPI-TIMESTAMP': timestamp,
                        'X-BAPI-RECV-WINDOW': recvWindow
                    }
                });

                const data = response.data;

                if (data.retCode !== 0) {
                    throw new BybitApiError(data.retCode, data.retMsg);
                }

                const list = data.result?.list || [];
                allTrades.push(...list);

                cursor = data.result?.nextPageCursor;
                if (!cursor || list.length === 0) {
                    break;
                }
            } catch (error) {
                if (error instanceof BybitApiError) {
                    throw error;
                }
                if (axios.isAxiosError(error)) {
                    throw new BybitApiError(
                        error.response?.status || 500,
                        `HTTP Error: ${error.response?.data?.retMsg || error.message}`
                    );
                }
                throw new BybitApiError(500, 'Unknown error during fetchTradesForWindow');
            }
        }

        return allTrades;
    }

    public normaliseBybitTrade(raw: BybitRawTrade, userId: string): NormalisedTrade {
        return {
            userId,
            exchange: 'bybit',
            symbol: raw.symbol,
            tradeId: raw.execId,
            orderId: raw.orderId,
            side: raw.side === 'Buy' ? 'BUY' : 'SELL',
            orderType: raw.orderType === 'Market' ? 'MARKET' : 'LIMIT',
            isMaker: raw.isMaker,
            executionPrice: parseFloat(raw.execPrice),
            quantity: parseFloat(raw.execQty),
            notional: parseFloat(raw.execValue),
            fee: parseFloat(raw.execFee),
            feeAsset: raw.feeCurrency,
            executedAt: new Date(Number(raw.execTime))
        };
    }
}
