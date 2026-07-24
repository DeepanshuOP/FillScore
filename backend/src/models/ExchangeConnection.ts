import mongoose, { Schema, Document } from 'mongoose';
import { EncryptedPayload } from '../utils/encryption';

export interface ExchangeConnectionDocument extends Document {
    userId?: string;
    accountId: string;
    exchange: 'binance' | 'bybit' | 'okx';
    encryptedApiKey: EncryptedPayload;
    encryptedApiSecret: EncryptedPayload;
    createdAt: Date;
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
        createdAt: { type: Date, default: Date.now },
    }
);

ExchangeConnectionSchema.index({ accountId: 1, exchange: 1 }, { unique: true });

export const ExchangeConnection = mongoose.model<ExchangeConnectionDocument>('ExchangeConnection', ExchangeConnectionSchema);
