import mongoose, { Schema } from 'mongoose';

/**
 * The review state of one order in the exception queue (M4 §2). One document per account and order; a missing document
 * means "open". Owner of every field: backend/src/routes/explain.ts. Demo accounts never get one (they are read-only).
 */
export const REVIEW_STATES = ['open', 'reviewed', 'dismissed'] as const;
export type ReviewState = typeof REVIEW_STATES[number];

export interface ExceptionReviewDocument {
    accountId: string;
    exchange: 'binance' | 'bybit' | 'okx';
    symbol: string;
    orderId: string;
    state: ReviewState;
    updatedAt: Date;
}

const ExceptionReviewSchema = new Schema<ExceptionReviewDocument>({
    accountId: { type: String, required: true },
    exchange: { type: String, required: true },
    symbol: { type: String, required: true },
    orderId: { type: String, required: true },
    state: { type: String, enum: REVIEW_STATES, required: true },
    updatedAt: { type: Date, required: true },
}, { timestamps: false, collection: 'exception_reviews' });

ExceptionReviewSchema.index({ accountId: 1, exchange: 1, symbol: 1, orderId: 1 }, { unique: true });

export const ExceptionReview = mongoose.model<ExceptionReviewDocument>('ExceptionReview', ExceptionReviewSchema);
