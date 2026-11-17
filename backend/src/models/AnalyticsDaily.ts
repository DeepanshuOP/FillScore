import mongoose, { Schema } from 'mongoose';

/**
 * Privacy-safe product analytics (M5): one counter per UTC day and event name. Nothing else is stored: no account id, no IP, no user
 * agent, no cookie, no order or trade data. Owner of every field: backend/src/routes/analytics.ts.
 */
export const ANALYTICS_EVENTS = ['dashboard_view', 'report_download', 'replay_open', 'quick_audit', 'deep_audit', 'evidence_pack_download'] as const;
export type AnalyticsEvent = typeof ANALYTICS_EVENTS[number];

export interface AnalyticsDailyDocument { day: string; event: AnalyticsEvent; count: number }

const AnalyticsDailySchema = new Schema<AnalyticsDailyDocument>({
    day: { type: String, required: true },
    event: { type: String, enum: ANALYTICS_EVENTS, required: true },
    count: { type: Number, required: true, default: 0 },
}, { timestamps: false, versionKey: false, collection: 'analytics_daily' });   // exactly day, event, count: no other field

AnalyticsDailySchema.index({ day: 1, event: 1 }, { unique: true });

export const AnalyticsDaily = mongoose.model<AnalyticsDailyDocument>('AnalyticsDaily', AnalyticsDailySchema);
