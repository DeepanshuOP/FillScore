export interface RefreshCookieConfigOptions {
    isProduction: boolean;
    isOAuthCallback?: boolean;
}

export interface RefreshCookieOptions {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'none' | 'lax' | 'strict';
    maxAge: number;
    path: string;
    domain?: string;
}

/**
 * Generates production-correct cookie options for the refresh token cookie.
 * SameSite=None is REQUIRED in production because the frontend (Vercel) and API
 * are different sites; None requires Secure.
 */
export function getRefreshCookieOptions(options: RefreshCookieConfigOptions): RefreshCookieOptions {
    const { isProduction } = options;
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    if (isProduction) {
        return {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge,
            path: '/'
        };
    }

    return {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge,
        path: '/'
    };
}
