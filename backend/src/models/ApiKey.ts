import mongoose, { Schema } from 'mongoose';

/**
 * A personal API key for the read-only MCP server (item 15). Only the SHA-256 of the key is stored, with its first 12 characters
 * (`fsk_` and 8 hex) as a visible prefix; the key itself is shown once, at creation. The only scope is `read`.
 */
export interface ApiKeyDocument {
    userId: string;
    name: string;
    prefix: string;
    keyHash: string;
    scope: 'read';
    createdAt: Date;
    expiresAt: Date;
    revokedAt?: Date | null;
    lastUsedAt?: Date | null;
}

const ApiKeySchema = new Schema<ApiKeyDocument>({
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    prefix: { type: String, required: true },
    keyHash: { type: String, required: true, unique: true },
    scope: { type: String, enum: ['read'], default: 'read', required: true },
    createdAt: { type: Date, default: Date.now, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
}, { collection: 'api_keys' });

export const ApiKey = mongoose.model<ApiKeyDocument>('ApiKey', ApiKeySchema);
