import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { OKXRawTrade, NormalisedTrade } from '../types';

export class OKXApiError extends Error {
    public retCode: string | number;

    constructor(retCode: string | number, message: string) {
        super(`OKX API Error ${retCode}: ${message}`);
        this.name = 'OKXApiError';
        this.retCode = retCode;
    }
}

export class OKXClient {
    private apiKey: string;
    private apiSecret: string;
    private passphrase: string;
    private axiosInstance: AxiosInstance;

    constructor(apiKey: string, apiSecret: string, passphrase: string) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.passphrase = passphrase;
        this.axiosInstance = axios.create({
            baseURL: 'https://www.okx.com',
            timeout: 10000,
        });
    }

    private sign(timestamp: string, method: string, path: string): string {
        const payload = timestamp + method + path;
        return crypto
            .createHmac('sha256', this.apiSecret)
            .update(payload)
            .digest('base64');
    }

    public async fetchTradesForWindow(instId: string, startTime: number, endTime: number): Promise<OKXRawTrade[]> {
        const allTrades: OKXRawTrade[] = [];
        let cursor: string | undefined = undefined;

        while (true) {
            const timestamp = new Date().toISOString();
            const params: Record<string, string | number> = {
                instType: 'SPOT',
                instId,
                begin: startTime,
                end: endTime
            };

            if (cursor) {
                params.after = cursor;
            }

            const queryString = Object.entries(params)
                .map(([key, value]) => `${key}=${value}`)
                .join('&');

            const path = '/api/v5/trade/fills-history';
            const fullPath = `${path}?${queryString}`;
            const signature = this.sign(timestamp, 'GET', fullPath);

            const headers = {
                'OK-ACCESS-KEY': this.apiKey,
                'OK-ACCESS-SIGN': signature,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'OK-ACCESS-PASSPHRASE': this.passphrase,
                'OK-ACCESS-PROJECT': ''
            };

            try {
                const response = await this.axiosInstance.get(fullPath, { headers });
                const data = response.data;

                if (data.code !== '0' && data.code !== 0) {
                    throw new OKXApiError(data.code, data.msg || 'OKX API error');
                }

                const list = data.data || [];
                if (list.length === 0) {
                    break;
                }

                allTrades.push(...list);

                cursor = list[list.length - 1]?.billId;
                if (!cursor) {
                    break;
                }
            } catch (error) {
                if (error instanceof OKXApiError) {
                    throw error;
                }
                if (axios.isAxiosError(error)) {
                    throw new OKXApiError(
                        error.response?.data?.code || error.response?.status || 500,
                        error.response?.data?.msg || error.message
                    );
                }
                throw new OKXApiError(500, 'Unknown error during fetchTradesForWindow');
            }
        }

        return allTrades;
    }

    public normaliseOKXTrade(raw: OKXRawTrade, userId: string): NormalisedTrade {
        const isMaker = raw.execType === 'M';
        return {
            userId,
            exchange: 'okx',
            symbol: raw.instId.replace('-', ''),
            tradeId: raw.billId,
            orderId: raw.ordId,
            side: raw.side === 'buy' ? 'BUY' : 'SELL',
            orderType: isMaker ? 'LIMIT' : 'MARKET',
            isMaker,
            executionPrice: parseFloat(raw.fillPx),
            quantity: parseFloat(raw.fillSz),
            notional: parseFloat(raw.fillPx) * parseFloat(raw.fillSz),
            fee: Math.abs(parseFloat(raw.fee)),
            feeAsset: raw.feeCcy,
            executedAt: new Date(Number(raw.ts))
        };
    }
}
