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

export interface BybitRawTrade {
    execId: string;
    orderId: string;
    symbol: string;
    execPrice: string;
    execQty: string;
    execValue: string;
    execFee: string;
    feeCurrency: string;
    execTime: string;
    side: 'Buy' | 'Sell';
    orderType: string;
    isMaker: boolean;
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
    exchange: "binance" | "bybit" | "okx";
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
    /** Fee in USD, computed at ingest (F-10). Absent on legacy/demo docs. */
    feeUsd?: number;
    executedAt: Date;
}

export interface MarketSnapshot {
    arrivalPriceProxy: number;
    vwap5min: number;
    bidAtExecution: number;
    askAtExecution: number;
    spreadBps: number;
}

/** 4a enrichment written by the ml-service backfill; optional, never read by the v1 scorer. */
export interface MarkoutEnrichment {
    spreadEstimates?: { cs: number | null; ar: number | null; n_pairs: number; version: number } | null;
    halfSpreadBps?: number | null;
    postPrices?: Record<string, number | null> | null;
    markoutVersion?: number;
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

export interface WhaleCorrelation {
    whaleNetPressure: number;
    whalePressure: number;
    whaleAdverseScore: number;
    whaleAdverse: boolean;
    whaleEventCount: number;
    whaleNearestS: number | null;
    whaleLargestNotional: number;
    whaleTopEvent?: {
        side: "BUY" | "SELL";
        notional: number;
        secondsFromTrade: number;
    } | null;
    whaleEnrichedAt: Date;
}

export interface EnrichedTrade extends NormalisedTrade, Partial<MarketSnapshot>, Partial<TradeMetrics>, Partial<TradeScores>, Partial<WhaleCorrelation>, MarkoutEnrichment { }

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
        /** Notional-weighted means of the engine's component scores (4R-0). Absent on audits stored before it. */
        componentMeans?: { slippage: number | null; fees: number | null; timing: number | null; spread: number | null } | null;
    };
    recommendations: string[];
    /** Trades the scorer refused, with reasons. Absent on audits stored before 4R-0b: read that as unknown, not 0. */
    skippedTrades?: { count: number; reasons: Record<string, number> };
    createdAt: Date;
}

export interface FetchTradesOptions {
    symbol: string;
    startTime: number;
    endTime: number;
    userId: string;
}

export interface OKXRawTrade {
    billId: string;
    ordId: string;
    instId: string;        // e.g. "BTC-USDT"
    side: 'buy' | 'sell';
    fillPx: string;        // execution price
    fillSz: string;        // quantity
    fee: string;           // negative = fee paid
    feeCcy: string;
    ts: string;            // Unix ms timestamp string
    execType: 'M' | 'T';  // M=maker, T=taker
}

