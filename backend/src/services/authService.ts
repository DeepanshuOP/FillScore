import mongoose from 'mongoose';
import { User } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { hashPassword, verifyPassword } from '../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import crypto from 'crypto';

export async function issueTokenPair(userId: mongoose.Types.ObjectId | string) {
    const userIdStr = userId.toString();
    const accessToken = signAccessToken({ userId: userIdStr });
    const refreshToken = signRefreshToken({ userId: userIdStr, jti: crypto.randomUUID() });

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const family = crypto.randomUUID();

    const rtDoc = new RefreshToken({
        userId: new mongoose.Types.ObjectId(userIdStr),
        tokenHash,
        family,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    await rtDoc.save();

    return {
        userId: userIdStr,
        accessToken,
        refreshToken
    };
}

export async function register(email: string, passwordRaw: string) {
    if (!passwordRaw) {
        throw new Error('Password is required');
    }
    if (passwordRaw.length < 8) {
        throw new Error('Password must be at least 8 characters');
    }

    const emailLower = email.toLowerCase();
    const existing = await User.findOne({ email: emailLower });
    if (existing) {
        throw new Error('Email already exists');
    }

    const passwordHash = await hashPassword(passwordRaw);
    const user = new User({
        email: emailLower,
        passwordHash
    });
    await user.save();

    return await issueTokenPair(user._id);
}

export async function login(email: string, passwordRaw: string) {
    const emailLower = email.toLowerCase();
    // 1. We must always hash a dummy or wait to avoid timing attacks, but for simplicity here we just return the generic error.
    const user = await User.findOne({ email: emailLower });
    
    let valid = false;
    if (user && user.passwordHash) {
        valid = await verifyPassword(passwordRaw, user.passwordHash);
    } else {
        // Hash a dummy password to equalize time (basic mitigation)
        await verifyPassword(passwordRaw, await hashPassword('dummy'));
    }

    if (!valid || !user) {
        throw new Error('Invalid email or password');
    }

    return await issueTokenPair(user._id);
}

export async function rotateRefresh(rawRefreshToken: string) {
    // 1. Verify token signature and expiration
    let payload;
    try {
        payload = verifyRefreshToken(rawRefreshToken);
    } catch (err) {
        throw new Error('Invalid refresh token');
    }

    // 2. Hash it to look up the document
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const tokenDoc = await RefreshToken.findOne({ tokenHash });

    if (!tokenDoc) {
        throw new Error('Invalid refresh token');
    }

    // 3. REUSE DETECTION CRITICAL PATH
    if (tokenDoc.status === 'rotated') {
        // This token was already used! Compromise detected.
        // Revoke the ENTIRE family.
        await RefreshToken.updateMany({ family: tokenDoc.family }, { $set: { status: 'revoked' } });
        throw new Error('reuse_detected');
    }

    if (tokenDoc.status === 'revoked') {
        throw new Error('token_revoked');
    }

    // 4. Legitimate rotation
    // Mark old token as rotated
    tokenDoc.status = 'rotated';
    await tokenDoc.save();

    // 5. Issue new pair
    const accessToken = signAccessToken({ userId: payload.userId });
    const newRefreshToken = signRefreshToken({ userId: payload.userId, jti: crypto.randomUUID() });

    const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    const newDoc = new RefreshToken({
        userId: tokenDoc.userId,
        tokenHash: newHash,
        family: tokenDoc.family, // SAME family lineage
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    await newDoc.save();

    return {
        accessToken,
        refreshToken: newRefreshToken
    };
}

export async function logout(rawRefreshToken: string) {
    if (!rawRefreshToken) return;

    try {
        // We do not care if it's expired for logout
        const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
        const tokenDoc = await RefreshToken.findOne({ tokenHash });
        if (tokenDoc) {
            // We can revoke just this token, or the whole family. Usually logging out revokes the family so all devices in that chain logout.
            await RefreshToken.updateMany({ family: tokenDoc.family }, { $set: { status: 'revoked' } });
        }
    } catch (err) {
        // swallow errors on logout
    }
}
