import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { User } from '../../models/User';
import { RefreshToken } from '../../models/RefreshToken';
import { findOrLinkOAuthUser, OAuthProfile } from '../oauthService';
import { loadEnv } from '../../config/env';

loadEnv();

describe('oauthService', () => {
    beforeAll(async () => {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI not set");
        await mongoose.connect(uri);

        await User.deleteMany({});
        await RefreshToken.deleteMany({});
    });

    afterEach(async () => {
        await User.deleteMany({});
        await RefreshToken.deleteMany({});
    });

    afterAll(async () => {
        // global teardown handles disconnect
    });

    it('1. New email, never seen -> creates a User with authProvider, no passwordHash', async () => {
        const profile: OAuthProfile = {
            provider: 'google',
            providerId: 'google-123',
            email: 'new@oauth.local',
            emailVerified: true
        };

        const result = await findOrLinkOAuthUser(profile);
        expect(result).toHaveProperty('accessToken');
        expect(result).toHaveProperty('refreshToken');

        const userDoc = await User.findOne({ email: 'new@oauth.local' });
        expect(userDoc).toBeDefined();
        expect(userDoc?.passwordHash).toBeUndefined();
        expect(userDoc?.emailVerified).toBe(true);
        expect(userDoc?.authProviders?.length).toBe(1);
        expect(userDoc?.authProviders![0].provider).toBe('google');
        expect(userDoc?.authProviders![0].providerId).toBe('google-123');
    });

    it('2. Email already exists (registered via password) -> LINKS the provider, returns token pair', async () => {
        // Seed a password user
        const passwordUser = new User({
            email: 'existing@oauth.local',
            passwordHash: 'dummy-hash'
        });
        await passwordUser.save();

        const profile: OAuthProfile = {
            provider: 'github',
            providerId: 'github-456',
            email: 'existing@oauth.local',
            emailVerified: true
        };

        const result = await findOrLinkOAuthUser(profile);
        expect(result).toHaveProperty('accessToken');
        expect(result).toHaveProperty('refreshToken');

        const userDoc = await User.findOne({ email: 'existing@oauth.local' });
        expect(userDoc?.passwordHash).toBe('dummy-hash'); // preserved
        expect(userDoc?.authProviders?.length).toBe(1);
        expect(userDoc?.authProviders![0].provider).toBe('github');
        expect(userDoc?.authProviders![0].providerId).toBe('github-456');
    });

    it('3. Same provider+providerId logging in again -> finds existing link, returns token pair', async () => {
        const profile: OAuthProfile = {
            provider: 'google',
            providerId: 'google-789',
            email: 'repeat@oauth.local',
            emailVerified: true
        };

        // First login
        await findOrLinkOAuthUser(profile);
        
        // Second login
        const result2 = await findOrLinkOAuthUser(profile);
        expect(result2).toHaveProperty('accessToken');
        
        const userDoc = await User.findOne({ email: 'repeat@oauth.local' });
        expect(userDoc?.authProviders?.length).toBe(1); // No duplicates
    });

    it('4. GitHub with NO email -> throws clear error, does not create user', async () => {
        const profile: OAuthProfile = {
            provider: 'github',
            providerId: 'github-no-email',
            email: null,
            emailVerified: false
        };

        await expect(findOrLinkOAuthUser(profile)).rejects.toThrow('email_required');
        
        const count = await User.countDocuments();
        expect(count).toBe(0);
    });

    it('5. Provider reports emailVerified=false -> rejects, does not auto-link', async () => {
        const passwordUser = new User({
            email: 'unverified@oauth.local',
            passwordHash: 'dummy-hash'
        });
        await passwordUser.save();

        const profile: OAuthProfile = {
            provider: 'github',
            providerId: 'github-hacker',
            email: 'unverified@oauth.local',
            emailVerified: false
        };

        await expect(findOrLinkOAuthUser(profile)).rejects.toThrow('unverified_email_rejected');

        const userDoc = await User.findOne({ email: 'unverified@oauth.local' });
        expect(userDoc?.authProviders?.length).toBe(0); // link failed
    });
});
