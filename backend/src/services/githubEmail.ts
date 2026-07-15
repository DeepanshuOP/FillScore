export interface GithubEmailResponse {
    email: string;
    primary: boolean;
    verified: boolean;
    visibility: string | null;
}

export async function fetchPrimaryVerifiedEmail(accessToken: string): Promise<{ email: string | null, verified: boolean }> {
    try {
        const res = await fetch('https://api.github.com/user/emails', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'FillScore'
            }
        });

        if (!res.ok) {
            return { email: null, verified: false };
        }

        const data: GithubEmailResponse[] = await res.json();
        
        if (!Array.isArray(data) || data.length === 0) {
            return { email: null, verified: false };
        }

        const primary = data.find(e => e.primary);
        if (primary) {
            return { email: primary.email, verified: primary.verified };
        }

        const anyVerified = data.find(e => e.verified);
        if (anyVerified) {
            return { email: anyVerified.email, verified: true };
        }

        return { email: null, verified: false };
    } catch (e) {
        // Fail closed on network throw
        return { email: null, verified: false };
    }
}
