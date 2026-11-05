import mongoose, { Schema } from 'mongoose';

export type SyncState = 'running' | 'done' | 'partial' | 'needs_attention' | 'failed';

/** One document per account: the lock (lease) and the status of the latest background sync. */
export interface SyncJobDocument {
    accountId: string;
    syncId: string;
    state: SyncState;
    startedAt: Date;
    finishedAt?: Date;
    /** Lease: a `running` job whose lease has expired (process died) can be retaken. */
    syncLockExpiresAt: Date;
    symbolsDone: number;
    symbolsTotal: number;
    tradesAdded: number;
    lookbackDays?: number;
    partial?: boolean;
    partialReason?: string;
    partialMessage?: string;
    error?: string;
    result?: Record<string, unknown>;
}

const SyncJobSchema = new Schema<SyncJobDocument>({
    accountId: { type: String, required: true, unique: true },
    syncId: { type: String, required: true },
    state: { type: String, enum: ['running', 'done', 'partial', 'needs_attention', 'failed'], required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    syncLockExpiresAt: { type: Date, required: true },
    symbolsDone: { type: Number, default: 0 },
    symbolsTotal: { type: Number, default: 0 },
    tradesAdded: { type: Number, default: 0 },
    lookbackDays: { type: Number },
    partial: { type: Boolean },
    partialReason: { type: String },
    partialMessage: { type: String },
    error: { type: String },
    result: { type: Schema.Types.Mixed },
});

export const SyncJob = mongoose.model<SyncJobDocument>('SyncJob', SyncJobSchema);
