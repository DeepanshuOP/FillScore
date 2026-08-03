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
