import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { extractZipSafely, UnsafeZipError } from '../utils/safeUnzip';

let root: string;
let dest: string;

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'safeunzip-'));
    dest = path.join(root, 'dest');
    fs.mkdirSync(dest);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function build(entries: Array<[string, Buffer]>): Buffer {
    const zip = new AdmZip();
    for (const [name, data] of entries) zip.addFile(name, data);
    return zip.toBuffer();
}

function listAll(dir: string): string[] {
    return fs.readdirSync(dir, { recursive: true } as any) as unknown as string[];
}

// Replace every occurrence of `from` with same-length `to` (local + central headers).
function patchBytes(buf: Buffer, from: Buffer, to: Buffer): Buffer {
    const out = Buffer.from(buf);
    let i = out.indexOf(from);
    let n = 0;
    while (i !== -1) {
        to.copy(out, i);
        n++;
        i = out.indexOf(from, i + from.length);
    }
    expect(n).toBeGreaterThanOrEqual(2);
    return out;
}

function expectUnsafe(fn: () => unknown, reason: string) {
    try {
        fn();
    } catch (e) {
        expect(e).toBeInstanceOf(UnsafeZipError);
        expect((e as UnsafeZipError).reason).toBe(reason);
        return;
    }
    throw new Error('expected UnsafeZipError ' + reason);
}

describe('extractZipSafely', () => {
    it('extracts normal entries', () => {
        // a.csv = "1,2\n3,4\n" = 8 bytes; sub/b.txt = "hello" = 5 bytes
        const buf = build([['a.csv', Buffer.from('1,2\n3,4\n')], ['sub/b.txt', Buffer.from('hello')]]);
        const written = extractZipSafely(buf, dest);
        expect(written).toHaveLength(2);
        expect(fs.readFileSync(path.join(dest, 'a.csv'), 'utf8')).toBe('1,2\n3,4\n');
        expect(fs.readFileSync(path.join(dest, 'sub', 'b.txt'), 'utf8')).toBe('hello');
    });

    it('rejects path traversal and writes nothing', () => {
        // build with a same-length (4 byte) name, then patch raw bytes in local + central headers to "../x"
        const raw = patchBytes(build([['ok.txt', Buffer.from('ok')], ['abcx', Buffer.from('evil')]]), Buffer.from('abcx'), Buffer.from('../x'));
        expectUnsafe(() => extractZipSafely(raw, dest), 'path_traversal');
        expect(listAll(dest)).toEqual([]);
        expect(fs.existsSync(path.join(root, 'x'))).toBe(false);
    });

    it('rejects a zip bomb by declared size', () => {
        // 1 MiB = 1,048,576 > 65,536
        const buf = build([['z.bin', Buffer.alloc(1048576)]]);
        expectUnsafe(() => extractZipSafely(buf, dest, { maxEntryBytes: 65536 }), 'entry_too_large');
        expect(listAll(dest)).toEqual([]);
    });

    it('catches a lying header at the actual-length check', () => {
        // declared size patched 1,048,576 (00 00 10 00 LE) -> 100 (64 00 00 00) in both headers
        const buf = build([['z.bin', Buffer.alloc(1048576)]]);
        const patched = patchBytes(buf, Buffer.from([0x00, 0x00, 0x10, 0x00]), Buffer.from([0x64, 0x00, 0x00, 0x00]));
        let threw = false;
        try {
            extractZipSafely(patched, dest, { maxEntryBytes: 65536 });
        } catch (e) {
            threw = true;
            if (e instanceof UnsafeZipError) expect(e.reason).toBe('entry_too_large');
        }
        expect(threw).toBe(true);
        expect(listAll(dest)).toEqual([]);
    });

    it('rejects when the running total exceeds the limit', () => {
        // 40,000 * 3 = 120,000 > 100,000
        const e = (n: string) => [n, Buffer.alloc(40000, 1)] as [string, Buffer];
        const buf = build([e('a.bin'), e('b.bin'), e('c.bin')]);
        expectUnsafe(() => extractZipSafely(buf, dest, { maxEntryBytes: 65536, maxTotalBytes: 100000 }), 'total_too_large');
        expect(listAll(dest)).toEqual([]);
    });

    it('rejects too many entries', () => {
        const buf = build([['a', Buffer.from('1')], ['b', Buffer.from('2')], ['c', Buffer.from('3')]]);
        expectUnsafe(() => extractZipSafely(buf, dest, { maxEntries: 2 }), 'too_many_entries');
        expect(listAll(dest)).toEqual([]);
    });
});
