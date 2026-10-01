import mongoose, { Schema, Document } from 'mongoose';

export interface IOAuthCode extends Document {
    codeHash: string;
    userId: string;
    expiresAt: Date;
}

const oauthCodeSchema = new Schema<IOAuthCode>({
    codeHash: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
});

// Unredeemed codes disappear on their own shortly after they expire
oauthCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthCode = mongoose.model<IOAuthCode>('OAuthCode', oauthCodeSchema);
