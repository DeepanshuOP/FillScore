import mongoose, { Schema } from 'mongoose';

/**
 * Order-level implementation shortfall, written by ml-service/measure/service.py into `order_measurements`.
 * The backend only reads it. Shape of `shortfall`: ml-service/measure/orders.py `order_is`.
 */
export interface OrderMeasurementDocument {
    accountId: string;
    exchange: 'binance' | 'bybit' | 'okx';
    symbol: string;
    orderId: string;
    version: string;
    side: number;
    tradeIds: string[];
    arrivalMs: number;
    endMs: number | null;
    endBasis: string | null;
    arrivalMid: number | null;
    endMid: number | null;
    shortfall: Record<string, unknown> | null;
    unmeasuredReason: string | null;
    marketDataRefs: Array<Record<string, unknown>>;
    measuredAt: Date;
}

const OrderMeasurementSchema = new Schema<OrderMeasurementDocument>({
    accountId: { type: String, required: true },
    exchange: { type: String, required: true },
    symbol: { type: String, required: true },
    orderId: { type: String, required: true },
    version: { type: String, required: true },
    side: { type: Number, required: true },
    tradeIds: { type: [String], default: [] },
    arrivalMs: { type: Number, required: true },
    endMs: { type: Number, default: null },
    endBasis: { type: String, default: null },
    arrivalMid: { type: Number, default: null },
    endMid: { type: Number, default: null },
    shortfall: { type: Schema.Types.Mixed, default: null },
    unmeasuredReason: { type: String, default: null },
    marketDataRefs: { type: [Schema.Types.Mixed] as any, default: [] },
    measuredAt: { type: Date, required: true },
}, { timestamps: false, collection: 'order_measurements' });

OrderMeasurementSchema.index({ accountId: 1, exchange: 1, symbol: 1, orderId: 1 }, { unique: true });

export const OrderMeasurement = mongoose.model<OrderMeasurementDocument>('OrderMeasurement', OrderMeasurementSchema);
