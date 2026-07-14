import { Router, Request, Response } from 'express';
import { register, login, rotateRefresh, logout } from '../services/authService';
import { authLimiter } from '../middleware/security';

const router = Router();

const setRefreshCookie = (res: Response, token: string) => {
    res.cookie('refreshToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
};

const clearRefreshCookie = (res: Response) => {
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
};

router.post('/register', authLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }

        const result = await register(email, password);
        setRefreshCookie(res, result.refreshToken);

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
        if (!email || !password) {
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

router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
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

router.post('/logout', async (req: Request, res: Response): Promise<void> => {
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

export const authRouter = router;
