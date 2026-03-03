import mongoose, { Schema, Document } from 'mongoose';
import { EnrichedTrade } from '../types';

export interface EnrichedTradeDocument extends Omit<EnrichedTrade, 'tradeId' | 'orderId'>, Document {
    tradeId: string;
    orderId: string;
}

const TradeSchema = new Schema<EnrichedTradeDocument>(
    {
        userId: { type: String, required: true },
        exchange: { type: String, enum: ['binance', 'bybit'], required: true },
        symbol: { type: String, required: true },
        tradeId: { type: String, required: true },
        orderId: { type: String, required: true },
        side: { type: String, enum: ['BUY', 'SELL'], required: true },
        orderType: { type: String, enum: ['MARKET', 'LIMIT', 'UNKNOWN'], required: true },
        isMaker: { type: Boolean, required: true },
        executionPrice: { type: Number, required: true },
        quantity: { type: Number, required: true },
        notional: { type: Number, required: true },
        fee: { type: Number, required: true },
        feeAsset: { type: String, required: true },
        executedAt: { type: Date, required: true },

        // Market Snapshot (optional)
        arrivalPriceProxy: { type: Number },
        vwap5min: { type: Number },
        bidAtExecution: { type: Number },
        askAtExecution: { type: Number },
        spreadBps: { type: Number },

        // Trade Metrics (optional)
        arrivalSlippageBps: { type: Number },
        vwapSlippageBps: { type: Number },
        spreadCostUSD: { type: Number },
        feeDragBps: { type: Number },
        liquidityWindow: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'] },

        // Trade Scores (optional)
        slippageScore: { type: Number },
        feeScore: { type: Number },
        timingScore: { type: Number },
        exchangeScore: { type: Number },
        fillScore: { type: Number },
        fillGrade: { type: String, enum: ['A', 'B', 'C', 'D', 'F'] },
    },
    {
        timestamps: true,
    }
);

// Compound unique index on { userId, exchange, tradeId } to prevent duplicate ingestion
TradeSchema.index({ userId: 1, exchange: 1, tradeId: 1 }, { unique: true });

// Basic index on (userId, symbol, executedAt) mentioned in step 14
TradeSchema.index({ userId: 1, symbol: 1, executedAt: 1 });

export const Trade = mongoose.model<EnrichedTradeDocument>('Trade', TradeSchema);
