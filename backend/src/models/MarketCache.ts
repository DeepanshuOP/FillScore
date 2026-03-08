import mongoose, { Schema, Document } from 'mongoose';

export interface MarketCacheDocument extends Document {
    key: string;
    data: mongoose.Schema.Types.Mixed;
    cachedAt: Date;
}

const MarketCacheSchema = new Schema<MarketCacheDocument>(
    {
        key: { type: String, required: true, unique: true },
        data: { type: Schema.Types.Mixed, required: true },
        cachedAt: { type: Date, default: Date.now },
    }
);

// TTL index to automatically expire documents after 24 hours (86400 seconds)
MarketCacheSchema.index({ cachedAt: 1 }, { expireAfterSeconds: 86400 });

export const MarketCache = mongoose.model<MarketCacheDocument>('MarketCache', MarketCacheSchema);
