import mongoose, { Schema, Document } from 'mongoose';

export interface AuditHistoryDocument extends Document {
    accountId: string;
    dataSource: 'synthetic-demo' | 'real-user';
    scoringVersion: string;
    snapshotAt: Date;
    avgFillScore: number;
    fillGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    totalTrades: number;
    totalNotional: number;
    estimatedLossUSD: number;
    avgSlippageBps: number;
    avgFeeDragBps: number;
    makerRatio: number;
    periodStart: Date;
    periodEnd: Date;
}

const AuditHistorySchema = new Schema<AuditHistoryDocument>({
    accountId: { type: String, required: true },
    dataSource: { type: String, enum: ['synthetic-demo', 'real-user'], required: true, immutable: true },
    scoringVersion: { type: String, required: true },
    snapshotAt: { type: Date, default: Date.now },
    avgFillScore: { type: Number, required: true },
    fillGrade: { type: String, enum: ['A', 'B', 'C', 'D', 'F'], required: true },
    totalTrades: { type: Number, required: true },
    totalNotional: { type: Number, default: 0 },
    estimatedLossUSD: { type: Number, default: 0 },
    avgSlippageBps: { type: Number, default: 0 },
    avgFeeDragBps: { type: Number, default: 0 },
    makerRatio: { type: Number, default: 0 },
    periodStart: { type: Date },
    periodEnd: { type: Date },
});

AuditHistorySchema.index({ accountId: 1, snapshotAt: 1 });

// One row is written per audit run and never edited. Deletes stay possible so an
// account can be erased on request; edits do not, so the trend cannot be rewritten.
const refuseUpdate = function (next: (err?: Error) => void) {
    next(new Error('audit_history_is_append_only'));
};
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'] as const) {
    AuditHistorySchema.pre(op, refuseUpdate as any);
}
AuditHistorySchema.pre('save', function (next) {
    if (!this.isNew) {
        return next(new Error('audit_history_is_append_only'));
    }
    next();
});

export const AuditHistory = mongoose.model<AuditHistoryDocument>('AuditHistory', AuditHistorySchema);
