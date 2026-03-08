import mongoose, { Schema, Document } from 'mongoose';
import { AuditSummary } from '../types';

export interface AuditSummaryDocument extends AuditSummary, Document {
    createdAt: Date;
}

const AuditSchema = new Schema<AuditSummaryDocument>(
    {
        userId: { type: String, required: true },
        period: {
            start: { type: Date, required: true },
            end: { type: Date, required: true },
        },
        exchange: { type: String, required: true },
        totalTrades: { type: Number, required: true },
        totalNotional: { type: Number, required: true },
        avgFillScore: { type: Number, required: true },
        fillGrade: { type: String, enum: ['A', 'B', 'C', 'D', 'F'], required: true },
        estimatedLossUSD: { type: Number, required: true },
        breakdown: {
            avgSlippageBps: { type: Number, required: true },
            avgFeeDragBps: { type: Number, required: true },
            makerRatio: { type: Number, required: true },
            bestHour: { type: Number, required: true },
            worstHour: { type: Number, required: true },
            bestSymbol: { type: String, required: true },
            worstSymbol: { type: String, required: true },
        },
        recommendations: [{ type: String }],
        createdAt: { type: Date, default: Date.now },
    },
    {
        timestamps: true,
    }
);

// Index on { userId, 'period.start': -1 }
AuditSchema.index({ userId: 1, 'period.start': -1 });

export const Audit = mongoose.model<AuditSummaryDocument>('Audit', AuditSchema);
