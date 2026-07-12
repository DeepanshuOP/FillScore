import mongoose, { Schema, Document } from 'mongoose';
import { EncryptedPayload } from '../utils/encryption';

export interface ExchangeConnectionDocument extends Document {
    userId: string;
    exchange: 'binance' | 'bybit';
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
        userId: { type: String, required: true, unique: true, index: true },
        exchange: { type: String, enum: ['binance', 'bybit'], required: true },
        encryptedApiKey: { type: EncryptedFieldSchema, required: true },
        encryptedApiSecret: { type: EncryptedFieldSchema, required: true },
        createdAt: { type: Date, default: Date.now },
    }
);

export const ExchangeConnection = mongoose.model<ExchangeConnectionDocument>('ExchangeConnection', ExchangeConnectionSchema);
