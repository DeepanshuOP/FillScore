import mongoose, { Schema } from 'mongoose';

/**
 * Scoring v2 results, written by the ml-service (POST /internal/score-v2) into `scores_v2`. The backend only reads.
 * `result` shape: ml-service/scoring_v2/aggregate.py score_account. ADR-0010 / ADR-0011.
 */
export interface ScoreV2Document {
    accountId: string;
    scoringVersion: string;
    versionFileSha256: string;
    measureVersion: string;
    integrityHash: string;
    inputKeys: string[];
    computedAt: Date;
    result: {
        components: Record<string, { score: number | null; measured: number; unmeasured: number; reason: string | null }>;
        composite: number | null;
        grade: string | null;
        band: [number, number] | null;
        reason: string | null;
        orders: number;
        fills: number;
    };
}

const ScoreV2Schema = new Schema<ScoreV2Document>({
    accountId: { type: String, required: true, index: true },
    scoringVersion: { type: String, required: true },
    versionFileSha256: { type: String, required: true },
    measureVersion: { type: String, required: true },
    integrityHash: { type: String, required: true },
    inputKeys: { type: [String], default: [] },
    computedAt: { type: Date, required: true },
    result: { type: Schema.Types.Mixed, required: true },
}, { timestamps: false, collection: 'scores_v2' });

export const ScoreV2 = mongoose.model<ScoreV2Document>('ScoreV2', ScoreV2Schema);
