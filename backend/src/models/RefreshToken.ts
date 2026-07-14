import mongoose, { Schema, Document } from 'mongoose';

export interface IRefreshToken extends Document {
    userId: mongoose.Types.ObjectId;
    tokenHash: string;
    family: string;
    status: 'active' | 'rotated' | 'revoked';
    expiresAt: Date;
    createdAt: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true }, // Ties the lineage of rotating tokens together
    status: { type: String, enum: ['active', 'rotated', 'revoked'], default: 'active', index: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Create TTL index on expiresAt so MongoDB automatically cleans up expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model<IRefreshToken>('RefreshToken', refreshTokenSchema);
