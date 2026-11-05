import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';

export interface SafeUnzipLimits {
    maxEntryBytes: number;
    maxTotalBytes: number;
    maxEntries: number;
}

export const DEFAULT_UNZIP_LIMITS: SafeUnzipLimits = {
    maxEntryBytes: 64 * 1024 * 1024,
    maxTotalBytes: 256 * 1024 * 1024,
    maxEntries: 16,
};

export type UnsafeZipReason = 'path_traversal' | 'entry_too_large' | 'total_too_large' | 'too_many_entries' | 'symlink';

export class UnsafeZipError extends Error {
    constructor(public readonly reason: UnsafeZipReason, public readonly entryName: string) {
        super(`Unsafe zip (${reason}): ${entryName}`);
        this.name = 'UnsafeZipError';
    }
}

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

function isTraversal(name: string, destRoot: string): boolean {
    if (name.startsWith('/') || name.startsWith('\\') || /^[A-Za-z]:/.test(name) || path.isAbsolute(name)) return true;
    if (name.split(/[\\/]/).includes('..')) return true;
    const target = path.resolve(destRoot, name);
    return !target.startsWith(destRoot + path.sep);
}

/** Validate every entry, then extract. A rejected archive writes nothing. Returns written absolute paths. */
export function extractZipSafely(source: string | Buffer, destDir: string, limits: Partial<SafeUnzipLimits> = {}): string[] {
    const lim: SafeUnzipLimits = { ...DEFAULT_UNZIP_LIMITS, ...limits };
    const zip = new AdmZip(source as any);
    const entries = zip.getEntries();
    const destRoot = path.resolve(destDir);

    if (entries.length > lim.maxEntries) throw new UnsafeZipError('too_many_entries', String(entries.length));

    let declaredTotal = 0;
    for (const entry of entries) {
        const rawName = entry.rawEntryName.toString('utf8');
        if (isTraversal(rawName, destRoot)) throw new UnsafeZipError('path_traversal', rawName);
        if ((((entry.header.attr >>> 16) & S_IFMT) >>> 0) === S_IFLNK) throw new UnsafeZipError('symlink', rawName);
        if (entry.isDirectory) continue;
        if (entry.header.size > lim.maxEntryBytes) throw new UnsafeZipError('entry_too_large', rawName);
        declaredTotal += entry.header.size;
        if (declaredTotal > lim.maxTotalBytes) throw new UnsafeZipError('total_too_large', rawName);
    }

    const written: string[] = [];
    const cleanup = () => {
        for (const f of written) fs.rmSync(f, { force: true });
    };
    try {
        let actualTotal = 0;
        for (const entry of entries) {
            const rawName = entry.rawEntryName.toString('utf8');
            const target = path.resolve(destRoot, rawName);
            if (entry.isDirectory) {
                fs.mkdirSync(target, { recursive: true });
                continue;
            }
            const data = entry.getData();
            if (data.length > lim.maxEntryBytes) throw new UnsafeZipError('entry_too_large', rawName);
            actualTotal += data.length;
            if (actualTotal > lim.maxTotalBytes) throw new UnsafeZipError('total_too_large', rawName);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, data);
            written.push(target);
        }
    } catch (e) {
        cleanup();
        throw e;
    }
    return written;
}
