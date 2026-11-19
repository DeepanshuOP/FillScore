import { ExchangeConnection, ExchangeConnectionDocument } from '../models/ExchangeConnection';
import { decryptApiKey, encryptApiKey, isLegacyPayload, type EncryptedPayload, type KeyField } from '../utils/encryption';

type Fields = Pick<ExchangeConnectionDocument, 'accountId' | 'exchange' | 'encryptedApiKey' | 'encryptedApiSecret' | 'encryptedPassphrase'>;

export interface ConnectionSecrets {
    apiKey: string;
    apiSecret: string;
    passphrase?: string;
    /** True when at least one blob was legacy and the three were stored again as version 2. */
    upgraded: boolean;
}

const FIELDS: Array<[KeyField, 'encryptedApiKey' | 'encryptedApiSecret' | 'encryptedPassphrase']> = [
    ['apiKey', 'encryptedApiKey'], ['apiSecret', 'encryptedApiSecret'], ['passphrase', 'encryptedPassphrase'],
];

const plain = (p: EncryptedPayload): EncryptedPayload => ({ iv: p.iv, encrypted: p.encrypted, authTag: p.authTag, ...(p.v !== undefined ? { v: p.v } : {}) });

/**
 * Decrypts every stored credential of a connection, each bound to (accountId, exchange, field).
 * Returns the plaintext and, when any blob is legacy, the version 2 replacements for all present fields (never a partial set).
 * Throws "Failed to decrypt ..." if any blob fails: a moved or tampered blob is never used.
 */
export function openConnection(conn: Fields): { secrets: Omit<ConnectionSecrets, 'upgraded'>; replacement: Record<string, EncryptedPayload> | null } {
    const out: Record<string, string> = {};
    let anyLegacy = false;
    for (const [field, prop] of FIELDS) {
        const blob = conn[prop];
        if (!blob) continue;
        out[field] = decryptApiKey(plain(blob), { userId: conn.accountId, exchange: conn.exchange, field });
        if (isLegacyPayload(blob)) anyLegacy = true;
    }
    let replacement: Record<string, EncryptedPayload> | null = null;
    if (anyLegacy) {
        replacement = {};
        for (const [field, prop] of FIELDS) {
            if (out[field] !== undefined) replacement[prop] = encryptApiKey(out[field], { userId: conn.accountId, exchange: conn.exchange, field });
        }
    }
    return { secrets: { apiKey: out.apiKey, apiSecret: out.apiSecret, ...(out.passphrase !== undefined ? { passphrase: out.passphrase } : {}) }, replacement };
}

/** Decrypts a connection's credentials for use, and stores legacy blobs again as version 2 (a failed write is logged by class and does not stop the sync). */
export async function readConnectionSecrets(conn: ExchangeConnectionDocument): Promise<ConnectionSecrets> {
    const { secrets, replacement } = openConnection(conn);
    let upgraded = false;
    if (replacement) {
        try {
            await ExchangeConnection.updateOne({ _id: conn._id }, { $set: replacement });
            upgraded = true;
        } catch (e) {
            console.error('Key envelope upgrade not stored:', (e as Error)?.name);
        }
    }
    return { ...secrets, upgraded };
}
