import { verifyPassword } from '../utils/password';

/** A login this recent counts as re-authentication for password-less (OAuth) accounts. */
export const RECENT_LOGIN_S = 5 * 60;

/**
 * Re-authentication for a sensitive action (deleting the account, creating a personal API key): the password for password accounts;
 * a login in the last 5 minutes for OAuth-only ones.
 */
export async function isReauthenticated(user: { passwordHash?: string | null }, password: unknown, authTime: number | undefined, nowS = Math.floor(Date.now() / 1000)): Promise<boolean> {
    if (user.passwordHash) return typeof password === 'string' && password.length > 0 && await verifyPassword(password, user.passwordHash);
    return typeof authTime === 'number' && nowS - authTime <= RECENT_LOGIN_S;
}
