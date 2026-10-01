import { Router, Request, Response } from 'express';
import { register, login, rotateRefresh, logout } from '../services/authService';
import { requestPasswordReset, resetPassword } from '../services/passwordResetService';
import { authLimiter } from '../middleware/security';
import { requireAuth } from '../middleware/requireAuth';
import { requireTrustedOrigin } from '../middleware/csrf';
import passport from 'passport';
import { env } from '../config/env';
import { createOAuthCode, redeemOAuthCode } from '../services/oauthCodeService';
import { sendVerificationEmail, verifyEmail } from '../services/emailVerificationService';
import { User } from '../models/User';

import { getRefreshCookieOptions } from '../utils/cookieConfig';

const router = Router();

// SameSite=None is REQUIRED in production because the frontend (Vercel) and API (Railway) are different sites; None requires Secure.
const setRefreshCookie = (res: Response, token: string, isOAuthCallback: boolean = false) => {
    const options = getRefreshCookieOptions({
        isProduction: process.env.NODE_ENV === 'production',
        isOAuthCallback
    });
    res.cookie('refreshToken', token, options);
};

const clearRefreshCookie = (res: Response) => {
    const options = getRefreshCookieOptions({
        isProduction: process.env.NODE_ENV === 'production'
    });
    // Destructure out maxAge; httpOnly, secure, sameSite, and path MUST match the set-cookie options exactly or the browser will not remove the cookie
    const { maxAge, ...clearOptions } = options;
    res.clearCookie('refreshToken', clearOptions);
};

router.post('/register', authLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;
        if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }

        const result = await register(email, password);
        setRefreshCookie(res, result.refreshToken);

        // Fire and forget: a mail provider outage must not block sign-up
        sendVerificationEmail(result.userId).catch(() => {
            console.error('[auth] verification email failed to send');
        });

        res.status(201).json({
            userId: result.userId,
            accessToken: result.accessToken
        });
    } catch (err: any) {
        if (err.message === 'Email already exists' || err.message.includes('Password')) {
            res.status(400).json({ error: err.message });
        } else {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

router.post('/login', authLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;
        if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }

        const result = await login(email, password);
        setRefreshCookie(res, result.refreshToken);

        res.status(200).json({
            userId: result.userId,
            accessToken: result.accessToken
        });
    } catch (err: any) {
        if (err.message === 'Invalid email or password') {
            res.status(401).json({ error: err.message });
        } else {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

router.post('/forgot-password', authLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;
        if (email && typeof email === 'string') {
            requestPasswordReset(email).catch(() => {
                console.error('[auth] forgot-password background error');
            });
        }
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(200).json({ success: true });
    }
});

router.post('/reset-password', authLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
        const { token, password } = req.body;
        if (!token || typeof token !== 'string') {
            res.status(400).json({ error: 'invalid_or_expired_token' });
            return;
        }

        await resetPassword(token, password);
        res.status(200).json({ success: true });
    } catch (err: any) {
        if (err.message === 'invalid_or_expired_token' || err.message === 'weak_password') {
            res.status(400).json({ error: err.message });
        } else {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

router.post('/verify-email', authLimiter, async (req: Request, res: Response): Promise<void> => {
    const token = req.body?.token;
    if (typeof token !== 'string' || token === '') {
        res.status(400).json({ error: 'invalid_or_expired_token' });
        return;
    }
    try {
        await verifyEmail(token);
        res.status(200).json({ success: true });
    } catch (err: any) {
        if (err.message === 'invalid_or_expired_token') {
            res.status(400).json({ error: 'invalid_or_expired_token' });
        } else {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

router.post('/resend-verification', authLimiter, requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        await sendVerificationEmail(req.userId!);
        res.status(200).json({ success: true });
    } catch (err) {
        console.error('[auth] resend verification failed');
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/refresh', requireTrustedOrigin(), async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.cookies?.refreshToken;
        if (!token) {
            res.status(401).json({ error: 'Refresh token missing' });
            return;
        }

        const result = await rotateRefresh(token);
        setRefreshCookie(res, result.refreshToken);

        res.status(200).json({
            accessToken: result.accessToken
        });
    } catch (err: any) {
        clearRefreshCookie(res);
        res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
});

router.post('/logout', requireTrustedOrigin(), async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.cookies?.refreshToken;
        if (token) {
            await logout(token);
        }
        clearRefreshCookie(res);
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await User.findById(req.userId).select('email plan emailVerified');
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.status(200).json({
            userId: req.userId,
            email: user.email,
            plan: user.plan,
            emailVerified: user.emailVerified === true
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

const frontendUrl = env.FRONTEND_URL || 'http://localhost:3000';

export const handleOAuthCallback = async (req: Request, res: Response) => {
    const user = req.user as any;

    // The OAuth callback is a top-level cross-site redirect.
    // The refresh cookie set on the callback MUST use sameSite:'lax' in dev,
    // or the browser drops it on the redirect. In production SameSite=None is used.
    setRefreshCookie(res, user.refreshToken, true);

    // Never put a token in the URL: hand over a 30 second single-use code instead.
    try {
        const code = await createOAuthCode(user.userId);
        res.redirect(`${frontendUrl}/?oauthCode=${code}`);
    } catch {
        res.redirect(`${frontendUrl}/login?error=auth_failed`);
    }
};

router.post('/oauth/exchange', authLimiter, requireTrustedOrigin(), async (req: Request, res: Response): Promise<void> => {
    const code = req.body?.code;
    if (typeof code !== 'string' || !/^[a-f0-9]{64}$/.test(code)) {
        res.status(400).json({ error: 'invalid_request' });
        return;
    }
    try {
        const { accessToken } = await redeemOAuthCode(code);
        res.status(200).json({ accessToken });
    } catch (err: any) {
        if (err.message === 'invalid_or_expired_code') {
            res.status(401).json({ error: 'invalid_or_expired_code' });
        } else {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

const oauthErrorHandler = (provider: string) => {
    return (req: Request, res: Response, next: any) => {
        passport.authenticate(provider, { session: false }, (err: any, user: any) => {
            if (err || !user) {
                const errorCode = err?.message || 'auth_failed';
                return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(errorCode)}`);
            }
            req.user = user;
            next();
        })(req, res, next);
    };
};

router.get('/google', passport.authenticate('google', { session: false, scope: ['profile', 'email'] }));
router.get('/google/callback', oauthErrorHandler('google'), handleOAuthCallback);

router.get('/github', passport.authenticate('github', { session: false, scope: ['user:email'] }));
router.get('/github/callback', oauthErrorHandler('github'), handleOAuthCallback);

export const authRouter = router;
