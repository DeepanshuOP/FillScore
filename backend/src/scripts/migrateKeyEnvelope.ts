/**
 * Re-encrypt stored exchange credentials as version 2 envelopes (AES-GCM associated data bound to accountId, exchange and field).
 *
 *   cd backend && npx ts-node src/scripts/migrateKeyEnvelope.ts            # DRY RUN (default): counts, writes nothing
 *   cd backend && npx ts-node src/scripts/migrateKeyEnvelope.ts --apply    # Deepanshu only: writes to the database
 *
 * Each legacy connection is decrypted first; one that cannot be decrypted is counted as failed and left untouched.
 * A connection is stored again only when all of its blobs decrypted. Output: counts only, never an id or a value.
 * The same upgrade also happens one connection at a time whenever a sync reads the credentials (services/keyEnvelope.ts),
 * so this script only speeds up the end state. MONGODB_URI comes from the environment (dotenv loads the backend env file).
 */
import mongoose from 'mongoose';
import { ExchangeConnection } from '../models/ExchangeConnection';
import { isLegacyPayload } from '../utils/encryption';
import { openConnection } from '../services/keyEnvelope';

export interface MigrationResult {
    total: number;
    alreadyV2: number;
    legacy: number;
    upgraded: number;
    failed: number;
    applied: boolean;
}

export async function migrateKeyEnvelopes(opts: { apply?: boolean }, log: (m: string) => void = console.log): Promise<MigrationResult> {
    const apply = opts.apply === true;
    const r: MigrationResult = { total: 0, alreadyV2: 0, legacy: 0, upgraded: 0, failed: 0, applied: apply };
    for await (const conn of ExchangeConnection.find({}).cursor()) {
        r.total++;
        const blobs = [conn.encryptedApiKey, conn.encryptedApiSecret, conn.encryptedPassphrase].filter(Boolean);
        if (!blobs.some(b => isLegacyPayload(b!))) { r.alreadyV2++; continue; }
        r.legacy++;
        try {
            const { replacement } = openConnection(conn);
            if (apply && replacement) {
                await ExchangeConnection.updateOne({ _id: conn._id }, { $set: replacement });
                r.upgraded++;
            }
        } catch {
            r.failed++;
        }
    }
    log(`connections: ${r.total}; already version 2: ${r.alreadyV2}; legacy: ${r.legacy}; failed to decrypt (left untouched): ${r.failed}`);
    log(apply ? `upgraded: ${r.upgraded}` : 'Dry run: nothing written. Re-run with --apply to upgrade the legacy connections.');
    return r;
}

async function main() {
    const { env } = await import('../config/env');
    await mongoose.connect(env.MONGODB_URI);
    try {
        const r = await migrateKeyEnvelopes({ apply: process.argv.includes('--apply') });
        process.exitCode = r.failed > 0 ? 1 : 0;
    } finally {
        await mongoose.disconnect();
    }
}

if (require.main === module) {
    main().catch(e => { console.error('migration failed:', (e as Error)?.name); process.exit(1); });
}
