/**
 * Regenerates ONLY the recommendation text of stored demo-* audits (older code stored advice wording).
 * Scores, grades and every other field are not touched: the script compares the audit with its
 * recommendations removed, before and after, and refuses to continue on any difference.
 *   npx tsx src/scripts/regenDemoRecommendations.ts            # dry-run (default): prints the diff only
 *   npx tsx src/scripts/regenDemoRecommendations.ts --apply    # writes the new text
 * Deepanshu runs this against Atlas; it is never run by the assistant.
 */
import mongoose from 'mongoose';
import { Audit } from '../models/Audit';
import { VALID_DEMO_USERS } from '../middleware/resolveAccount';
import { regenerateRecommendations } from '../services/auditText';

const withoutRecs = (o: any) => JSON.stringify({ ...o, recommendations: undefined });

export async function regenDemoRecommendations(apply: boolean, log: (s: string) => void = console.log) {
    const audits = await Audit.find({ accountId: { $in: [...VALID_DEMO_USERS] } });
    let changed = 0;
    for (const a of audits) {
        const plain = a.toObject();
        const next = await regenerateRecommendations(plain, a.accountId);
        if (next.length === 0) { log(`SKIP ${a.accountId} (${a._id}): no scored trades to regenerate from`); continue; }
        if (JSON.stringify(next) === JSON.stringify(plain.recommendations)) { log(`same ${a.accountId} (${a._id})`); continue; }
        // The would-be document differs from the stored one in recommendations only.
        const after = { ...plain, recommendations: next };
        if (withoutRecs(plain) !== withoutRecs(after)) throw new Error(`score fields would change for ${a.accountId}; aborting`);
        log(`${apply ? 'UPDATE' : 'WOULD UPDATE'} ${a.accountId} (${a._id}); score fields byte-identical`);
        (plain.recommendations as string[]).forEach(r => log(`  - ${r}`));
        next.forEach(r => log(`  + ${r}`));
        if (apply) {
            await Audit.updateOne({ _id: a._id }, { $set: { recommendations: next } }, { timestamps: false });
            const re = await Audit.findById(a._id);
            if (withoutRecs(re!.toObject()) !== withoutRecs(plain)) throw new Error(`score fields changed for ${a.accountId} after write`);
        }
        changed++;
    }
    log(`${apply ? 'Updated' : 'Would update'} ${changed} of ${audits.length} demo audit(s).${apply ? '' : ' Re-run with the apply flag to write.'}`);
    return { changed, total: audits.length };
}

if (require.main === module) {
    (async () => {
        const { loadEnv } = await import('../config/env');
        loadEnv();
        await mongoose.connect(process.env.MONGODB_URI!);
        await regenDemoRecommendations(process.argv.includes('--apply'));
        await mongoose.disconnect();
    })().catch(e => { console.error(e.message); process.exit(1); });
}
