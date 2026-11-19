import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';

/** Envelope version. A payload without `v` is the original form (no associated data); `v` 2 binds the ciphertext to a context. */
export const ENVELOPE_VERSION = 2;

export interface EncryptedPayload {
    iv: string;
    encrypted: string;
    authTag: string;
    /** 2 = AES-GCM associated data of (userId, exchange, field). Absent = legacy, still readable, re-encrypted on next use. */
    v?: number;
}

export type KeyField = 'apiKey' | 'apiSecret' | 'passphrase';

/** What a stored credential belongs to. Used as AES-GCM associated data: a blob copied to another account, exchange or field cannot be decrypted. */
export interface KeyContext {
    userId: string;
    exchange: string;
    field: KeyField;
}

/** JSON of a fixed array: unambiguous (no separator can be confused with a value), the same bytes on every run. */
const aadFor = (ctx: KeyContext): Buffer => Buffer.from(JSON.stringify(['fillscore-key-envelope', ENVELOPE_VERSION, ctx.userId, ctx.exchange, ctx.field]), 'utf8');

export const isLegacyPayload = (payload: EncryptedPayload): boolean => payload.v === undefined;

/**
 * Encrypts a plaintext string (like an API key or secret) using AES-256-GCM.
 * This ensures confidentiality and authenticity of the data.
 * 
 * @param plaintext - The raw string to encrypt.
 * @param ctx - The owner (userId, exchange, field). Always pass it in production code: the payload is then version 2 and bound to it.
 *   Without it the payload is the legacy form (tests and the migration's old-blob fixtures only; a test fails on a production call without it).
 * @returns An object containing the initialization vector (iv), the encrypted string, and the authentication tag (authTag). All values are hex encoded.
 */
export const encryptApiKey = (plaintext: string, ctx?: KeyContext): EncryptedPayload => {
    // Generate a random 12-byte initialization vector. 
    // 12 bytes is the recommended length for GCM mode for performance and security.
    // Using a random IV ensures that identical plaintexts encrypt to different ciphertexts.
    const iv = crypto.randomBytes(12);

    // The ENCRYPTION_KEY must be exactly 32 bytes (256 bits) for AES-256.
    // It is parsed from the environment variable hex string into a Buffer.
    const keyBuffer = Buffer.from(env.ENCRYPTION_KEY, 'hex');

    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
    if (ctx) cipher.setAAD(aadFor(ctx));

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // The authentication tag is crucial in GCM mode; it verifies that the data hasn't been tampered with.
    const authTag = cipher.getAuthTag().toString('hex');

    return {
        iv: iv.toString('hex'),
        encrypted,
        authTag,
        ...(ctx ? { v: ENVELOPE_VERSION } : {}),
    };
};

/**
 * Decrypts a previously encrypted payload.
 * 
 * @param payload - The object containing `iv`, `encrypted` data, and `authTag`.
 * @returns The original plaintext string.
 * @throws Will throw an error if the authTag doesn't match or decryption fails (e.g., if the data was tampered with).
 */
export const decryptApiKey = (payload: EncryptedPayload, ctx?: KeyContext): string => {
    try {
        const keyBuffer = Buffer.from(env.ENCRYPTION_KEY, 'hex');
        const ivBuffer = Buffer.from(payload.iv, 'hex');
        const authTagBuffer = Buffer.from(payload.authTag, 'hex');

        const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, ivBuffer);

        // Set the authentication tag generated during encryption so it can be verified.
        decipher.setAuthTag(authTagBuffer);
        // Version 2: the context is part of what the tag authenticates. A legacy payload (no `v`) used none and is read as before.
        // A version 2 payload read without a context, or with another one, fails the tag check below.
        if (!isLegacyPayload(payload)) {
            if (!ctx) throw new Error('context_required');
            decipher.setAAD(aadFor(ctx));
        }

        let decrypted = decipher.update(payload.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        throw new Error('Failed to decrypt API key. Data may have been tampered with or encryption key is invalid.');
    }
};

/**
 * Creates a SHA-256 hash of a raw identifier.
 * This is a one-way function used so we can securely identify users without storing their actual raw identification.
 * 
 * @param rawId - The raw identifier string to hash.
 * @returns The hex-encoded SHA-256 hash.
 */
export const hashUserId = (rawId: string): string => {
    return crypto.createHash('sha256').update(rawId).digest('hex');
};
