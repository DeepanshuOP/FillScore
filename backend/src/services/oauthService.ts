import { User } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { issueTokenPair } from './authService';

export interface OAuthProfile {
    provider: 'google' | 'github';
    providerId: string;
    email?: string | null;
    emailVerified: boolean;
}

export async function findOrLinkOAuthUser(profile: OAuthProfile) {
    const { provider, providerId, email, emailVerified } = profile;

    if (!email) {
        throw new Error('email_required');
    }

    const emailLower = email.toLowerCase();

    // Do NOT auto-link an unverified email (account takeover vector)
    if (!emailVerified) {
        throw new Error('unverified_email_rejected');
    }

    // 1. Try to find user by linked provider + providerId
    let user = await User.findOne({
        'authProviders.provider': provider,
        'authProviders.providerId': providerId
    });

    if (user) {
        return await issueTokenPair(user._id);
    }

    // 2. See if user with this email already exists
    user = await User.findOne({ email: emailLower });

    if (user) {
        // Link the new provider
        if (!user.authProviders) {
            user.authProviders = [];
        }
        user.authProviders.push({ provider, providerId });

        // The provider just proved control of this inbox. If the local account was never
        // verified, whoever created it may not own the address (pre-registration squatting),
        // so their password and live sessions are discarded.
        if (!user.emailVerified) {
            user.passwordHash = undefined;
            user.emailVerified = true;
            await RefreshToken.updateMany(
                { userId: user._id, status: { $ne: 'revoked' } },
                { $set: { status: 'revoked' } }
            );
        }
        await user.save();
        
        return await issueTokenPair(user._id);
    }

    // 3. New email, create new user without passwordHash
    user = new User({
        email: emailLower,
        emailVerified: true,
        authProviders: [{ provider, providerId }]
    });
    await user.save();

    return await issueTokenPair(user._id);
}
