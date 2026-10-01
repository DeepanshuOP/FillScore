const FALLBACK_MESSAGE = 'Agent Council is temporarily unavailable. Please try again shortly.';

export function councilMaintenanceMessage(status: number, body: unknown): string | null {
    if (status !== 503) return null;

    if (body && typeof body === 'object' && 'detail' in body) {
        const detail = (body as { detail?: unknown }).detail;
        if (typeof detail === 'string' && detail.trim().length > 0) {
            return detail;
        }
    }

    return FALLBACK_MESSAGE;
}

const GENERIC_COUNCIL_ERROR = 'The Council hit an unexpected problem. Please try again.';

const COUNCIL_ERROR_MESSAGES: Record<string, string> = {
    RATE_LIMIT_EXHAUSTED: 'The Council is at capacity right now. Please try again in a few minutes.',
    DB_UNAVAILABLE: "The Council can't reach its data right now. Please try again shortly.",
    NO_DATA: 'There are no scored trades to analyse for this account yet.',
    MODEL_UNAVAILABLE: "The Council's AI model is unavailable right now. This is a configuration problem on our side, not yours.",
};

/**
 * Turns a typed error code from the Council stream into user-facing copy. The server's own
 * message text is never shown, because exception strings can carry connection details.
 */
export function councilErrorMessage(code: string | undefined): string {
    return (code && COUNCIL_ERROR_MESSAGES[code]) || GENERIC_COUNCIL_ERROR;
}

export function councilOfflineMessage(isDevelopment: boolean): string {
    if (isDevelopment) {
        return 'Agent Council service is offline. Start it with: cd ml-service && python -m uvicorn main:app --port 8000, then try again.';
    }
    return 'The Agent Council is offline right now. Please try again shortly.';
}
