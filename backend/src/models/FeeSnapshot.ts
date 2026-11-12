import mongoose, { Schema } from 'mongoose';

/**
 * The account's commission rates for one symbol at one time, stored raw (M1 Part B). The effective-rate formula
 * lives in ml-service/measure/fees.py, where Scoring v2 uses it. Binance GET /api/v3/account/commission, weight 20,
 * docs read 2026-11-11: https://developers.binance.com/docs/binance-spot-api-docs/rest-api/account-endpoints
 * ("Query Commission Rates"). A snapshot is the rate when fetched, not necessarily the rate at an older trade.
 */
export interface CommissionParts { maker: number; taker: number; buyer: number; seller: number }

export interface FeeSnapshotDocument {
    accountId: string;
    exchange: 'binance' | 'bybit' | 'okx';
    symbol: string;
    standard: CommissionParts;
    tax: CommissionParts;
    special: CommissionParts;
    discount?: { enabledForAccount: boolean; enabledForSymbol: boolean; asset: string; rate: number };
    /** 'account': the exchange's answer for this account. 'published-schedule': the venue's published regular tier,
     *  used only for the synthetic demo accounts (M2), never presented as an account's own rate. */
    source: 'account' | 'published-schedule';
    fetchedAt: Date;
}

const Parts = { maker: { type: Number, required: true }, taker: { type: Number, required: true }, buyer: { type: Number, required: true }, seller: { type: Number, required: true } };

const FeeSnapshotSchema = new Schema<FeeSnapshotDocument>({
    accountId: { type: String, required: true },
    exchange: { type: String, enum: ['binance', 'bybit', 'okx'], required: true },
    symbol: { type: String, required: true },
    standard: Parts,
    tax: Parts,
    special: Parts,
    discount: { enabledForAccount: Boolean, enabledForSymbol: Boolean, asset: String, rate: Number },
    source: { type: String, enum: ['account', 'published-schedule'], required: true },
    fetchedAt: { type: Date, required: true },
}, { timestamps: false, collection: 'fee_snapshots' });

FeeSnapshotSchema.index({ accountId: 1, exchange: 1, symbol: 1, fetchedAt: -1 });

export const FeeSnapshot = mongoose.model<FeeSnapshotDocument>('FeeSnapshot', FeeSnapshotSchema);
