import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../password';

describe('Password Utilities', () => {
    it('hashes a known plaintext password and verifies it successfully', async () => {
        const plaintext = 'SuperSecret123!';
        const hash = await hashPassword(plaintext);
        
        expect(hash).not.toBe(plaintext);
        
        const isValid = await verifyPassword(plaintext, hash);
        expect(isValid).toBe(true);
    });

    it('returns false for a wrong password against a correct hash', async () => {
        const plaintext = 'SuperSecret123!';
        const hash = await hashPassword(plaintext);
        
        const isValid = await verifyPassword('WrongPassword!', hash);
        expect(isValid).toBe(false);
    });

    it('produces two different hashes for the same password but both verify correctly', async () => {
        const plaintext = 'SuperSecret123!';
        const hash1 = await hashPassword(plaintext);
        const hash2 = await hashPassword(plaintext);
        
        expect(hash1).not.toBe(hash2);
        
        const isValid1 = await verifyPassword(plaintext, hash1);
        const isValid2 = await verifyPassword(plaintext, hash2);
        
        expect(isValid1).toBe(true);
        expect(isValid2).toBe(true);
    });

    it('rejects empty-string passwords at the hashing utility level', async () => {
        await expect(hashPassword('')).rejects.toThrow();
    });
});
