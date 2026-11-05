import mongoose, { Schema, Document } from 'mongoose';
import { EncryptedPayload } from '../utils/encryption';

export interface ExchangeConnectionDocument extends Document {
    userId?: string;
    accountId: string;
    exchange: 'binance' | 'bybit' | 'okx';
    encryptedApiKey: EncryptedPayload;
    encryptedApiSecret: EncryptedPayload;
    // OKX only; other exchanges leave it unset
    encryptedPassphrase?: EncryptedPayload;
    createdAt: Date;
    /** Sync lookback chosen by the user; 3650 means all available history. */
    lookbackDays?: number;
    /** Binance: extra symbols the user says they traded (validated against exchangeInfo at sync). */
    extraSymbols?: string[];
    status?: 'ok' | 'needs_attention';
    statusReason?: string;
    lastSyncAt?: Date;
    lastSyncPartial?: boolean;
    /** Binance: per-symbol earliest time (ms) known fully fetched, so a repeat long-lookback sync skips the backfill. */
    lookbackCoveredFrom?: Record<string, number>;
}

const EncryptedFieldSchema = new Schema(
    {
        iv: { type: String, required: true },
        encrypted: { type: String, required: true },
        authTag: { type: String, required: true },
    },
    { _id: false }
);

const ExchangeConnectionSchema = new Schema<ExchangeConnectionDocument>(
    {
        userId: { type: String, required: false },
        accountId: { type: String, required: true, index: true },
        exchange: { type: String, enum: ['binance', 'bybit', 'okx'], required: true },
        encryptedApiKey: { type: EncryptedFieldSchema, required: true },
        encryptedApiSecret: { type: EncryptedFieldSchema, required: true },
        encryptedPassphrase: { type: EncryptedFieldSchema, required: false },
        createdAt: { type: Date, default: Date.now },
        lookbackDays: { type: Number, required: false },
        extraSymbols: { type: [String], default: undefined },
        status: { type: String, enum: ['ok', 'needs_attention'], default: 'ok' },
        statusReason: { type: String, required: false },
        lastSyncAt: { type: Date, required: false },
        lastSyncPartial: { type: Boolean, required: false },
        lookbackCoveredFrom: { type: Schema.Types.Mixed, required: false },
    }
);

ExchangeConnectionSchema.index({ accountId: 1, exchange: 1 }, { unique: true });

export const ExchangeConnection = mongoose.model<ExchangeConnectionDocument>('ExchangeConnection', ExchangeConnectionSchema);
