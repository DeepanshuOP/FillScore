export interface BinanceRawTrade {
    id: number;
    orderId: number;
    symbol: string;
    price: string;
    qty: string;
    quoteQty: string;
    commission: string;
    commissionAsset: string;
    time: number;
    isBuyer: boolean;
    isMaker: boolean;
    isBestMatch: boolean;
}

export type BinanceKline = [
    number, // Open time
    string, // Open
    string, // High
    string, // Low
    string, // Close
    string, // Volume
    number, // Close time
    string, // Quote asset volume
    number, // Number of trades
    string, // Taker buy base asset volume
    string, // Taker buy quote asset volume
    string  // Ignore
];

export interface NormalisedTrade {
    userId: string;
    exchange: "binance" | "bybit";
    symbol: string;
    tradeId: string;
    orderId: string;
    side: "BUY" | "SELL";
    orderType: "MARKET" | "LIMIT" | "UNKNOWN";
    isMaker: boolean;
    executionPrice: number;
    quantity: number;
    notional: number;
    fee: number;
    feeAsset: string;
    executedAt: Date;
}

export interface MarketSnapshot {
    arrivalPriceProxy: number;
    vwap5min: number;
    bidAtExecution: number;
    askAtExecution: number;
    spreadBps: number;
}

export interface TradeMetrics {
    arrivalSlippageBps: number;
    vwapSlippageBps: number;
    spreadCostUSD: number;
    feeDragBps: number;
    liquidityWindow: "HIGH" | "MEDIUM" | "LOW";
}

export interface TradeScores {
    slippageScore: number;
    feeScore: number;
    timingScore: number;
    exchangeScore: number;
    fillScore: number;
    fillGrade: "A" | "B" | "C" | "D" | "F";
}

export interface EnrichedTrade extends NormalisedTrade, Partial<MarketSnapshot>, Partial<TradeMetrics>, Partial<TradeScores> { }

export interface AuditSummary {
    userId: string;
    period: { start: Date; end: Date };
    exchange: string;
    totalTrades: number;
    totalNotional: number;
    avgFillScore: number;
    fillGrade: "A" | "B" | "C" | "D" | "F";
    estimatedLossUSD: number;
    breakdown: {
        avgSlippageBps: number;
        avgFeeDragBps: number;
        makerRatio: number;
        bestHour: number;
        worstHour: number;
        bestSymbol: string;
        worstSymbol: string;
    };
    recommendations: string[];
    createdAt: Date;
}

export interface FetchTradesOptions {
    symbol: string;
    startTime: number;
    endTime: number;
    userId: string;
}
