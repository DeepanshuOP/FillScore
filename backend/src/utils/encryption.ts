import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';

export interface EncryptedPayload {
    iv: string;
    encrypted: string;
    authTag: string;
}

/**
 * Encrypts a plaintext string (like an API key or secret) using AES-256-GCM.
 * This ensures confidentiality and authenticity of the data.
 * 
 * @param plaintext - The raw string to encrypt.
 * @returns An object containing the initialization vector (iv), the encrypted string, and the authentication tag (authTag). All values are hex encoded.
 */
export const encryptApiKey = (plaintext: string): EncryptedPayload => {
    // Generate a random 12-byte initialization vector. 
    // 12 bytes is the recommended length for GCM mode for performance and security.
    // Using a random IV ensures that identical plaintexts encrypt to different ciphertexts.
    const iv = crypto.randomBytes(12);

    // The ENCRYPTION_KEY must be exactly 32 bytes (256 bits) for AES-256.
    // It is parsed from the environment variable hex string into a Buffer.
    const keyBuffer = Buffer.from(env.encryptionKey, 'hex');

    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // The authentication tag is crucial in GCM mode; it verifies that the data hasn't been tampered with.
    const authTag = cipher.getAuthTag().toString('hex');

    return {
        iv: iv.toString('hex'),
        encrypted,
        authTag,
    };
};

/**
 * Decrypts a previously encrypted payload.
 * 
 * @param payload - The object containing `iv`, `encrypted` data, and `authTag`.
 * @returns The original plaintext string.
 * @throws Will throw an error if the authTag doesn't match or decryption fails (e.g., if the data was tampered with).
 */
export const decryptApiKey = (payload: EncryptedPayload): string => {
    try {
        const keyBuffer = Buffer.from(env.encryptionKey, 'hex');
        const ivBuffer = Buffer.from(payload.iv, 'hex');
        const authTagBuffer = Buffer.from(payload.authTag, 'hex');

        const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, ivBuffer);

        // Set the authentication tag generated during encryption so it can be verified.
        decipher.setAuthTag(authTagBuffer);

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
