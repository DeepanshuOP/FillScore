/**
 * Loading and diagnosing EVIDENCE_SIGNING_KEY. The value is a secret: nothing here returns or logs it.
 * A dashboard stores the PEM either as real lines or as one line with a literal backslash-n; both load.
 * A value without the BEGIN/END lines (pasted body only) cannot load; it is reported by the startup line, never thrown.
 */
import crypto from 'crypto';

export const normaliseSigningKey = (raw: string | undefined): string => (raw ?? '').replace(/\\n/g, '\n').trim();

export interface SigningKeyDiagnosis {
    present: boolean;
    length: number;
    hasBeginEnd: boolean;
    usable: boolean;
    /** The parser's error class name (for example "TypeError" or "Error"), never its message. */
    errorClass: string | null;
}

export function diagnoseSigningKey(raw: string | undefined): SigningKeyDiagnosis {
    const value = normaliseSigningKey(raw);
    if (!value) return { present: false, length: 0, hasBeginEnd: false, usable: false, errorClass: null };
    const hasBeginEnd = /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value) && /-----END [A-Z ]*PRIVATE KEY-----/.test(value);
    try {
        const k = crypto.createPrivateKey(value);
        if (k.asymmetricKeyType !== 'ed25519') return { present: true, length: value.length, hasBeginEnd, usable: false, errorClass: 'NotEd25519' };
        return { present: true, length: value.length, hasBeginEnd, usable: true, errorClass: null };
    } catch (e) {
        return { present: true, length: value.length, hasBeginEnd, usable: false, errorClass: e instanceof Error ? e.constructor.name : 'UnknownError' };
    }
}

/** One server line at startup when the key is absent or unusable. Silent when the key works. */
export function logSigningKeyStatus(raw: string | undefined, log: (line: string) => void = console.warn): void {
    const d = diagnoseSigningKey(raw);
    if (d.usable) return;
    log(`EVIDENCE_SIGNING_KEY not usable: present=${d.present ? 'yes' : 'no'} length=${d.length} pem_lines=${d.hasBeginEnd ? 'yes' : 'no'} error_class=${d.errorClass ?? 'none'}`);
}
