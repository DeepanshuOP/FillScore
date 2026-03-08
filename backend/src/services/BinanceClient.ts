import axios, { AxiosInstance, AxiosError } from 'axios';
import crypto from 'crypto';
import { BinanceRawTrade } from '../types';

export class BinanceApiError extends Error {
    public statusCode: number | undefined;

    constructor(message: string, statusCode?: number) {
        super(message);
        this.name = 'BinanceApiError';
        this.statusCode = statusCode;
    }
}

export class BinanceClient {
    private axiosInstance: AxiosInstance;
    private apiSecret: string;

    constructor(apiKey: string, apiSecret: string) {
        this.apiSecret = apiSecret;
        this.axiosInstance = axios.create({
            baseURL: 'https://api.binance.com',
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

    public async fetchTradesForWindow(symbol: string, startTime: number, endTime: number): Promise<BinanceRawTrade[]> {
        const params = {
            symbol,
            startTime,
            endTime,
            timestamp: Date.now(),
            limit: 1000 // Binance max limit per page
        };

        const signedQuery = this.signQuery(params);
        const url = `/api/v3/myTrades?${signedQuery}`;

        try {
            const response = await this.axiosInstance.get<BinanceRawTrade[]>(url);
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 429) {
                    const retryAfterStr = error.response.headers['retry-after'];
                    // Fallback to 5 seconds if header isn't present
                    const retryAfterMs = retryAfterStr ? parseInt(retryAfterStr, 10) * 1000 : 5000;
                    console.warn(`[BinanceClient] Rate limited HTTP 429. Retrying after ${retryAfterMs}ms...`);
                    await this.sleep(retryAfterMs);

                    // Retry logic (only once)
                    const retryParams = {
                        symbol,
                        startTime,
                        endTime,
                        timestamp: Date.now(),
                        limit: 1000
                    };
                    const retrySignedQuery = this.signQuery(retryParams);
                    const retryUrl = `/api/v3/myTrades?${retrySignedQuery}`;

                    try {
                        const retryResponse = await this.axiosInstance.get<BinanceRawTrade[]>(retryUrl);
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
            throw new BinanceApiError('Unknown error during fetchTradesForWindow');
        }
    }

    public async fetchFeeRate(symbol: string): Promise<{ makerRate: number; takerRate: number }> {
        const params = {
            symbol,
            timestamp: Date.now(),
        };

        const signedQuery = this.signQuery(params);
        const url = `/api/v3/tradeFee?${signedQuery}`;

        try {
            const response = await this.axiosInstance.get<Array<{ symbol: string; makerCommission: string; takerCommission: string }>>(url);

            const feeData = response.data.find(d => d.symbol === symbol);
            if (!feeData) {
                throw new BinanceApiError(`Fee rate not found for symbol ${symbol}`, 404);
            }

            return {
                makerRate: parseFloat(feeData.makerCommission),
                takerRate: parseFloat(feeData.takerCommission),
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new BinanceApiError(
                    `Binance API Error (fetchFeeRate): ${error.response?.data?.msg || error.message}`,
                    error.response?.status
                );
            }
            throw new BinanceApiError('Unknown error during fetchFeeRate');
        }
    }
}
