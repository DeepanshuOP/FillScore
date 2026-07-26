import mongoose, { Schema, Document } from 'mongoose';

export interface IPasswordResetToken extends Document {
    userId: mongoose.Types.ObjectId;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date | null;
    createdAt: Date;
}

const passwordResetTokenSchema = new Schema<IPasswordResetToken>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

// TTL index on expiresAt so MongoDB automatically cleans up expired tokens
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetToken = mongoose.model<IPasswordResetToken>('PasswordResetToken', passwordResetTokenSchema);
