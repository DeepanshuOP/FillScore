import mongoose, { Schema, Document } from 'mongoose';

export interface IEmailVerificationToken extends Document {
    userId: mongoose.Types.ObjectId;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date | null;
    createdAt: Date;
}

const emailVerificationTokenSchema = new Schema<IEmailVerificationToken>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

// Expired tokens are removed by MongoDB itself
emailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailVerificationToken = mongoose.model<IEmailVerificationToken>(
    'EmailVerificationToken',
    emailVerificationTokenSchema
);
