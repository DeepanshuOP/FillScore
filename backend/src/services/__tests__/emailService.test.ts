import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendEmail } from '../emailService';

describe('emailService', () => {
    const originalEnv = { ...process.env };
    let consoleSpy: any;

    beforeEach(() => {
        vi.resetAllMocks();
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        consoleSpy.mockRestore();
    });

    it('console-fallback without key in dev', async () => {
        delete process.env.RESEND_API_KEY;
        process.env.NODE_ENV = 'development';

        await sendEmail({
            to: 'test@example.com',
            subject: 'Password Reset',
            html: '<p>Reset link</p>'
        });

        expect(consoleSpy).toHaveBeenCalledWith('[email] would send to <redacted> — subject: Password Reset');
    });

    it('throws in production without key', async () => {
        delete process.env.RESEND_API_KEY;
        process.env.NODE_ENV = 'production';

        await expect(
            sendEmail({
                to: 'test@example.com',
                subject: 'Password Reset',
                html: '<p>Reset link</p>'
            })
        ).rejects.toThrow('Email sending is not configured in production environment.');
    });

    it('sends with key present using fetch', async () => {
        process.env.RESEND_API_KEY = 're_test_123456';
        process.env.EMAIL_FROM = 'test@resend.dev';
        const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        global.fetch = mockFetch as any;

        await sendEmail({
            to: 'test@example.com',
            subject: 'Password Reset',
            html: '<p>Reset link</p>'
        });

        expect(mockFetch).toHaveBeenCalledWith('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer re_test_123456',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'test@resend.dev',
                to: 'test@example.com',
                subject: 'Password Reset',
                html: '<p>Reset link</p>'
            })
        });
    });

    it('never includes the key in any thrown message when fetch fails', async () => {
        const secretKey = 're_super_secret_api_key_12345';
        process.env.RESEND_API_KEY = secretKey;
        const mockFetch = vi.fn().mockRejectedValue(new Error(`Failed with ${secretKey}`));
        global.fetch = mockFetch as any;

        try {
            await sendEmail({
                to: 'test@example.com',
                subject: 'Password Reset',
                html: '<p>Reset link</p>'
            });
            expect.unreachable('should have thrown');
        } catch (err: any) {
            expect(err.message).not.toContain(secretKey);
            expect(err.message).toContain('[REDACTED]');
        }
    });
});
