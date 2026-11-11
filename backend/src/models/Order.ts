import mongoose, { Schema } from 'mongoose';

/**
 * One exchange order (M1 Part B). Unlike trades, orders change after creation (status, executedQty), so the
 * sync upserts them with the mutable fields refreshed. Owner of every field: backend/src/services/orders/.
 * Fields from Binance GET /api/v3/allOrders, docs read 2026-11-11:
 * https://developers.binance.com/docs/binance-spot-api-docs/rest-api/account-endpoints ("All orders").
 */
export const ORDER_STATUSES = ['NEW', 'PENDING_NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'PENDING_CANCEL', 'REJECTED', 'EXPIRED', 'EXPIRED_IN_MATCH'] as const;
/** Statuses after which an order no longer changes. */
export const FINAL_STATUSES = new Set(['FILLED', 'CANCELED', 'REJECTED', 'EXPIRED', 'EXPIRED_IN_MATCH']);

export interface OrderDocument {
    accountId: string;
    exchange: 'binance' | 'bybit' | 'okx';
    symbol: string;
    orderId: string;
    clientOrderId?: string;
    side: 'BUY' | 'SELL';
    type: string;
    timeInForce?: string;
    price?: number;
    origQty: number;
    executedQty: number;
    cummulativeQuoteQty?: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    /** First fill time minus creation time (ms), limit-type orders only; null otherwise or when unfilled. */
    restingMs: number | null;
    dataSource: 'synthetic-demo' | 'real-user';
}

const OrderSchema = new Schema<OrderDocument>({
    accountId: { type: String, required: true, index: true },
    exchange: { type: String, enum: ['binance', 'bybit', 'okx'], required: true },
    symbol: { type: String, required: true },
    orderId: { type: String, required: true },
    clientOrderId: { type: String },
    side: { type: String, enum: ['BUY', 'SELL'], required: true },
    type: { type: String, required: true },
    timeInForce: { type: String },
    price: { type: Number },
    origQty: { type: Number, required: true },
    executedQty: { type: Number, required: true },
    cummulativeQuoteQty: { type: Number },
    status: { type: String, required: true },
    // Exchange times, not mongoose timestamps (timestamps are off for this model).
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    restingMs: { type: Number, default: null },
    dataSource: { type: String, enum: ['synthetic-demo', 'real-user'], required: true, immutable: true },
}, { timestamps: false });

OrderSchema.index({ accountId: 1, exchange: 1, symbol: 1, orderId: 1 }, { unique: true });

export const Order = mongoose.model<OrderDocument>('Order', OrderSchema);
